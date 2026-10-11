import { deliverQueuedEmail } from "./deliverQueuedEmail.ts";
import { finalizeQueuedEmail } from "./finalizeQueuedEmail.ts";
import type {
  WorkerContext,
  OutboundEmailRow,
  RowOutcome,
} from "./mailQueue.types.ts";
import type { Kysely } from "kysely";
import type { OutboundEmailKind } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { makeScrubPatchFromKind } from "./makeScrubPatchFromKind.ts";
import type { EmailService } from "./EmailService/EmailService.types.ts";
import {
  EMAIL_RENDERERS,
  type EmailRenderer,
} from "./templates/emailTemplates.constants.ts";

/** What one pass over the queue needs. */
export type MailQueueRunOptions = {
  database: Kysely<Database>;
  /** Undefined when the instance has no way to deliver at all. */
  sender: EmailService | undefined;
  /** The instant the pass runs at. */
  now: string;
  /** How many rows to claim. Defaults to `BATCH_SIZE`, and exists for tests. */
  batchSize?: number;
};

/** What one pass over the queue did. */
export type MailWorkerSummary = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  /** Rows put back because the instance is not configured to send yet. */
  deferredCount: number;
};

/** How many rows one pass claims. */
const BATCH_SIZE = 20;

/** How long a row waits when the instance is not configured to send. */
const CONFIGURATION_RETRY_SECONDS = 300;

/** Which counter each outcome moves. `skipped` moves none, so it is absent. */
const SUMMARY_KEY: Record<
  Exclude<RowOutcome, "skipped">,
  keyof MailWorkerSummary
> = {
  sent: "sentCount",
  failed: "failedCount",
  suppressed: "suppressedCount",
  deferred: "deferredCount",
};

function _shift(options: { now: string; seconds: number }): string {
  return new Date(
    Date.parse(options.now) + options.seconds * 1000,
  ).toISOString();
}

/**
 * The claim, which is the whole of the concurrency control
 * (`apis/notifications.md` § Claiming, retrying and scrubbing).
 *
 * SQLite serialises writers, so of two workers reaching the same row exactly
 * one sees one row changed and the other moves on. Nothing else is needed and
 * nothing else is used: no lease column, no advisory lock, no transaction
 * around the send.
 */
async function _claim(options: {
  context: WorkerContext;
  id: string;
}): Promise<boolean> {
  const claimed = await options.context.database
    .updateTable("outbound_emails")
    .set({ state: "sending" })
    .where("id", "=", options.id)
    .where("state", "=", "queued")
    .executeTakeFirst();
  return Number(claimed.numUpdatedRows) === 1;
}

/** Whether the provider has asked us to stop writing to this address. */
async function _isSuppressed(options: {
  context: WorkerContext;
  address: string;
}): Promise<boolean> {
  const suppression = await options.context.database
    .selectFrom("email_suppressions")
    .select("id")
    .where("address", "=", options.address)
    .where("cleared_at", "is", null)
    .executeTakeFirst();
  return suppression !== undefined;
}

/**
 * One kind's renderer, or `undefined` for a kind whose copy is not written
 * yet.
 *
 * The lookup still has to be able to miss, but for the honest reason rather
 * than the old one: the row's kind is one of the seven, and only one of the
 * seven has copy today. `Partial` is what makes `noUncheckedIndexedAccess`
 * supply the `undefined` the caller tests for, and it stops being partial one
 * kind at a time as each later step ships its template.
 */
function _rendererFor(kind: OutboundEmailKind): EmailRenderer | undefined {
  const renderers: Partial<Record<OutboundEmailKind, EmailRenderer>> =
    EMAIL_RENDERERS;
  return renderers[kind];
}

/**
 * Puts a claimed row back, because the instance cannot send yet.
 *
 * **A configuration gap is not a delivery attempt.** `attempts` is left
 * exactly where it was, so the queue drains by itself the moment an admin
 * fills the setting in, rather than having burned all five attempts in the
 * two and a half hours they spent reading the setup page.
 */
async function _defer(options: {
  context: WorkerContext;
  row: OutboundEmailRow;
}): Promise<RowOutcome> {
  const { context, row } = options;
  await finalizeQueuedEmail({
    context,
    id: row.id,
    values: {
      state: "queued",
      next_attempt_at: _shift({
        now: context.now,
        seconds: CONFIGURATION_RETRY_SECONDS,
      }),
      last_error_code:
        context.fromAddress === undefined
          ? "from_address_unset"
          : "provider_unconfigured",
      last_error_message: "Mail is not configured, so nothing was attempted.",
    },
  });
  return "deferred";
}

/**
 * Claims one row and carries it to whichever end it reaches.
 *
 * **The order of the checks is load-bearing.** Suppression is tested *before*
 * the template lookup, so a message to an address the provider has told us to
 * stop writing to is marked `suppressed` whether or not its copy exists yet.
 * And the suppression check is skipped for `sign_in_code`, and only for
 * `sign_in_code`: a spam complaint must never lock a family member out of
 * their own archive, and the repeated failure is itself the diagnostic.
 */
async function _processRow(options: {
  context: WorkerContext;
  row: OutboundEmailRow;
}): Promise<RowOutcome> {
  const { context, row } = options;
  const claimed = await _claim({ context, id: row.id });
  if (!claimed) {
    return "skipped";
  }

  if (
    row.kind !== "sign_in_code" &&
    (await _isSuppressed({ context, address: row.to_address }))
  ) {
    await finalizeQueuedEmail({
      context,
      id: row.id,
      values: {
        state: "suppressed",
        last_error_code: "address_suppressed",
        last_error_message:
          "The provider has asked us to stop writing to this address.",
        ...makeScrubPatchFromKind(row.kind),
      },
    });
    return "suppressed";
  }

  const { fromAddress, sender } = context;
  if (fromAddress === undefined || sender === undefined) {
    return await _defer({ context, row });
  }

  const render = _rendererFor(row.kind);
  if (render === undefined) {
    await finalizeQueuedEmail({
      context,
      id: row.id,
      values: {
        state: "failed",
        last_error_code: "no_template",
        last_error_message: `No copy is written for ${row.kind} yet.`,
        // Terminal like any other, so it scrubs like any other. Unreachable
        // for `sign_in_code` while that kind has copy, and reachable the
        // moment a later step ships a caller whose template lands in a
        // following commit.
        ...makeScrubPatchFromKind(row.kind),
      },
    });
    return "failed";
  }

  return await deliverQueuedEmail({
    context,
    row,
    render,
    fromAddress,
    sender,
  });
}

/**
 * The selection `apis/notifications.md` § Claiming, retrying and scrubbing
 * writes verbatim: queued, due, and past whatever backoff it is serving.
 */
async function _selectEligible(options: {
  database: Kysely<Database>;
  now: string;
  limit: number;
}): Promise<OutboundEmailRow[]> {
  const { now } = options;
  return await options.database
    .selectFrom("outbound_emails")
    .selectAll()
    .where("state", "=", "queued")
    .where("send_after", "<=", now)
    .where((eb) => {
      return eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", now),
      ]);
    })
    .orderBy("send_after", "asc")
    .limit(options.limit)
    .execute();
}

/**
 * Runs one pass over `outbound_emails`.
 *
 * Selection and claiming are `apis/notifications.md` § Claiming, retrying and
 * scrubbing verbatim.
 *
 * **A row seen mid-flight is never picked up again.** Only `queued` is
 * selected, so a process that dies between the claim and the finalise leaves
 * its row in `sending` and nothing here recovers it. That is deliberate: a
 * reaper cannot tell a crashed worker from a slow one, and re-sending a
 * message the provider already accepted is the worse of the two failures.
 *
 * Nothing from `payload_json` is ever logged: it holds a live sign-in code.
 *
 * @param options The catalog handle, the sender, the instant and the batch
 *   size. See `MailQueueRunOptions`.
 * @returns What the pass did, by outcome.
 */
export async function runMailQueueOnce(
  options: MailQueueRunOptions,
): Promise<MailWorkerSummary> {
  const { database, sender, now } = options;
  const summary: MailWorkerSummary = {
    sentCount: 0,
    failedCount: 0,
    suppressedCount: 0,
    deferredCount: 0,
  };

  const settings = await readInstanceSettings({
    database,
    keys: ["mail.from_address", "mail.from_name", "shoebox.name"],
  });
  const context: WorkerContext = {
    database,
    sender,
    now,
    // The settings module answers `null` for a cleared key, which is what
    // clearing one puts on the wire. Everything below here is undefined-based.
    fromAddress: settings["mail.from_address"] ?? undefined,
    fromName: settings["mail.from_name"] ?? settings["shoebox.name"],
  };

  const eligible = await _selectEligible({
    database,
    now,
    limit: options.batchSize ?? BATCH_SIZE,
  });

  for (const row of eligible) {
    const outcome = await _processRow({ context, row });
    if (outcome !== "skipped") {
      summary[SUMMARY_KEY[outcome]] += 1;
    }
  }

  return summary;
}
