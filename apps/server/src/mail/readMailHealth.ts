import type {
  MailDeliveryFailure,
  MailDiagnosis,
  MailHealthResponse,
  MailQueueHealth,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { saveInstanceSetting } from "../settings/saveInstanceSetting.ts";
import type { MailDomainReader } from "./mailDomainReader.types.ts";
import { makeMailDeliveryFailureFromStoredError } from "./makeMailDeliveryFailureFromStoredError.ts";
import { readMailQueueHealth } from "./readMailQueueHealth.ts";

const HEALTH_KEYS = [
  "public.base_url",
  "mail.from_address",
  "mail.from_name",
  "mail.domain_verified_at",
  "mail.domain_last_check_error",
] as const;
const NO_READER_ERROR =
  "Real mail provider verification is unavailable. Configure RESEND_API_KEY and enable real delivery.";
type DomainFacts = { verifiedAt: string | null; error: string | null };

function _getDomainFromAddress(address: string | null): string | undefined {
  return address?.split("@").at(-1)?.toLowerCase();
}

type DomainCheckOptions = {
  database: DatabaseExecutor;
  domainReader: MailDomainReader | undefined;
  domain: string | undefined;
  now: string;
};

function _getVerifiedAtFromRead(options: {
  result: Awaited<ReturnType<MailDomainReader>>;
  storedVerifiedAt: string | null;
  now: string;
}): string | null {
  if (options.result.error !== undefined) {
    return options.storedVerifiedAt;
  }
  return options.result.isVerified
    ? (options.storedVerifiedAt ?? options.now)
    : null;
}

async function _persistDomainFacts(
  options: Readonly<DomainCheckOptions>,
  result: Awaited<ReturnType<MailDomainReader>>,
): Promise<DomainFacts | undefined> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const settings = await readInstanceSettings({
        database: transaction,
        keys: HEALTH_KEYS,
      });
      if (
        _getDomainFromAddress(settings["mail.from_address"]) !== options.domain
      ) {
        return undefined;
      }
      const verifiedAt = _getVerifiedAtFromRead({
        result,
        storedVerifiedAt: settings["mail.domain_verified_at"],
        now: options.now,
      });
      const writeOptions = {
        transaction,
        memberId: undefined,
        now: options.now,
      };
      if (result.error === undefined) {
        await saveInstanceSetting({
          ...writeOptions,
          key: "mail.domain_verified_at",
          value: verifiedAt,
        });
      }
      await saveInstanceSetting({
        ...writeOptions,
        key: "mail.domain_last_check_error",
        value: result.error ?? null,
      });
      return { verifiedAt, error: result.error ?? null };
    },
  });
}

async function _checkDomain(
  options: Readonly<DomainCheckOptions>,
): Promise<DomainFacts | undefined> {
  if (options.domain === undefined || options.domainReader === undefined) {
    return undefined;
  }
  // The provider request finishes before acquiring SQLite's write lock.
  const result = await options.domainReader(options.domain).catch(() => {
    return {
      isVerified: false,
      error: "Unable to read provider domains.",
    };
  });
  return _persistDomainFacts(options, result);
}

const INTERNAL_ERROR_CODES = [
  "base_url_unset",
  "from_address_unset",
  "provider_unconfigured",
  "no_template",
  "render_failed",
  "address_suppressed",
];
const ONE_DAY_MS = 86_400_000;

function _getFailureQuery(database: DatabaseExecutor) {
  return database
    .selectFrom("outbound_emails")
    .select(["last_error_code", "last_error_message", "created_at", "kind"])
    .where((expression) => {
      return expression.or([
        expression("state", "=", "failed"),
        expression.and([
          expression("state", "=", "queued"),
          expression.or([
            expression("last_error_code", "is not", null),
            expression("last_error_message", "is not", null),
          ]),
        ]),
      ]);
    })
    .orderBy("created_at", "desc")
    .orderBy("id", "desc");
}

function _getFailureFromRow(
  row: Awaited<
    ReturnType<ReturnType<typeof _getFailureQuery>["executeTakeFirst"]>
  >,
): MailDeliveryFailure | null {
  return row === undefined ? null : makeMailDeliveryFailureFromStoredError(row);
}

async function _readLastFailure(
  database: DatabaseExecutor,
): Promise<MailDeliveryFailure | null> {
  return _getFailureFromRow(
    await _getFailureQuery(database).executeTakeFirst(),
  );
}

async function _readCurrentRefusal(options: {
  database: DatabaseExecutor;
  now: string;
}): Promise<MailDeliveryFailure | null> {
  const dayAgo = new Date(Date.parse(options.now) - ONE_DAY_MS).toISOString();
  const row = await _getFailureQuery(options.database)
    .where((expression) => {
      return expression.or([
        expression("state", "=", "queued"),
        expression("created_at", ">", dayAgo),
      ]);
    })
    .where((expression) => {
      return expression.or([
        expression("last_error_code", "is", null),
        expression("last_error_code", "not in", INTERNAL_ERROR_CODES),
      ]);
    })
    .executeTakeFirst();
  return _getFailureFromRow(row);
}

type DiagnosisOptions = {
  isBaseUrlSet: boolean;
  fromAddress: string | null;
  domain: string | undefined;
  facts: DomainFacts;
  domainReadError: string | undefined;
  queue: MailQueueHealth;
  lastError: MailDeliveryFailure | null;
  currentRefusal: MailDeliveryFailure | null;
};

function _getDomainDiagnosisFromHealth(
  options: Readonly<DiagnosisOptions>,
): MailDiagnosis | undefined {
  const checkError = options.domainReadError ?? options.facts.error;
  const isVerificationFailure = /domain.*verif|verif.*domain/i.test(
    `${options.currentRefusal?.code ?? ""} ${options.currentRefusal?.message ?? ""}`,
  );
  if (
    options.facts.verifiedAt !== null &&
    checkError === null &&
    !isVerificationFailure
  ) {
    return undefined;
  }
  return {
    code: "domain_unverified",
    domain: options.domain ?? "",
    providerError:
      checkError ??
      (isVerificationFailure
        ? (options.currentRefusal?.message ?? null)
        : null),
  };
}

function _getDiagnosisFromHealth(
  options: Readonly<DiagnosisOptions>,
): MailDiagnosis | null {
  if (!options.isBaseUrlSet) {
    return { code: "base_url_unset", settingKey: "public.base_url" };
  }
  if (options.fromAddress === null) {
    return { code: "from_address_unset", settingKey: "mail.from_address" };
  }
  const domainDiagnosis = _getDomainDiagnosisFromHealth(options);
  if (domainDiagnosis !== undefined) {
    return domainDiagnosis;
  }
  if (options.currentRefusal !== null) {
    return {
      code: "provider_rejecting",
      providerStatus: options.currentRefusal.code,
      providerMessage: options.currentRefusal.message,
      failingSince: options.currentRefusal.occurredAt,
    };
  }
  if (options.queue.oldestQueuedAt !== null) {
    return {
      code: "backlog",
      oldestQueuedAt: options.queue.oldestQueuedAt,
      queuedCount: options.queue.queuedCount,
    };
  }
  return null;
}

async function _readSuppressionCount(
  database: DatabaseExecutor,
): Promise<number> {
  const suppressions = await database
    .selectFrom("email_suppressions")
    .select(({ fn }) => {
      return fn.countAll<number>().as("count");
    })
    .where("cleared_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(suppressions.count);
}

function _getMailResponseFromFacts(
  options: Readonly<DiagnosisOptions> & {
    fromName: string | null;
    suppressedAddressCount: number;
  },
): MailHealthResponse {
  const diagnosis = _getDiagnosisFromHealth(options);
  return {
    status:
      diagnosis === null
        ? "ok"
        : options.queue.sentLast24hCount > 0
          ? "degraded"
          : "failing",
    diagnosis,
    fromAddress: options.fromAddress,
    fromName: options.fromName,
    sendingDomain: options.domain ?? null,
    domainVerifiedAt: options.facts.verifiedAt,
    domainLastCheckError: options.facts.error,
    isBaseUrlSet: options.isBaseUrlSet,
    queue: options.queue,
    lastError: options.lastError,
    suppressedAddressCount: options.suppressedAddressCount,
  };
}

/** Reads configuration and actionable health without exposing mail payloads. */
export async function readMailHealth(options: {
  database: DatabaseExecutor;
  domainReader: MailDomainReader | undefined;
  now: string;
}): Promise<MailHealthResponse> {
  const readOptions = { database: options.database, keys: HEALTH_KEYS };
  const initialSettings = await readInstanceSettings(readOptions);
  const checkedFacts = await _checkDomain({
    ...options,
    domain: _getDomainFromAddress(initialSettings["mail.from_address"]),
  });
  const settings = await readInstanceSettings(readOptions);
  const facts = {
    verifiedAt: settings["mail.domain_verified_at"],
    error:
      settings["mail.domain_last_check_error"] === null
        ? null
        : "Unable to read provider domains.",
  };
  const domainReadError =
    options.domainReader === undefined
      ? NO_READER_ERROR
      : checkedFacts === undefined
        ? "The sender domain changed during verification. Read health again."
        : undefined;
  const queue = await readMailQueueHealth({
    database: options.database,
    now: options.now,
  });
  return _getMailResponseFromFacts({
    isBaseUrlSet: settings["public.base_url"] !== null,
    fromAddress: settings["mail.from_address"],
    fromName: settings["mail.from_name"],
    domain: _getDomainFromAddress(settings["mail.from_address"]),
    facts,
    domainReadError,
    queue,
    lastError: await _readLastFailure(options.database),
    currentRefusal: await _readCurrentRefusal(options),
    suppressedAddressCount: await _readSuppressionCount(options.database),
  });
}
