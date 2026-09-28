import type { Kysely, UpdateObject } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { makeScrubPatchFromKind } from "./makeScrubPatchFromKind.ts";
import type { MailSender } from "./createResendMailSender.ts";
import { MailSendError } from "./MailSendError.ts";
import {
  EMAIL_RENDERERS,
  type EmailRenderer,
} from "./templates/emailTemplates.constants.ts";

/** What one pass over the queue did. */
export type MailWorkerSummary = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  /** Rows put back because the instance is not configured to send yet. */
  deferredCount: number;
};

/** One claimed row, exactly as the selection reads it. */
type OutboundEmailRow = Database["outbound_emails"];

/** What one row's pass did. `skipped` is a row another worker claimed. */
type RowOutcome = "sent" | "failed" | "suppressed" | "deferred" | "skipped";

/** Everything a row's pass needs that is the same for every row in it. */
type WorkerContext = {
  database: Kysely<Database>;
  sender: MailSender | undefined;
  now: string;
  fromAddress: string | undefined;
  fromName: string | undefined;
};

/** The one message to send, and the two things needed to address it. */
type DeliverOptions = {
  context: WorkerContext;
  row: OutboundEmailRow;
  render: EmailRenderer;
  fromAddress: string;
  sender: MailSender;
};

/** How many rows one pass claims. */
const BATCH_SIZE = 20;

/**
 * One minute, five, twenty-five, then two hours, and then it is over.
 *
 * Long enough to ride out a provider outage, short enough that a sign-in code
 * is either useful or dead well inside the ten minutes it is good for. Four
 * delays is what makes the fifth attempt the last: a refusal with no delay
 * left behind it is terminal, which is where the five comes from.
 */
const RETRY_BACKOFF_SECONDS = [60, 300, 1500, 7200];

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

function _shift(now: string, seconds: number): string {
  return new Date(Date.parse(now) + seconds * 1000).toISOString();
}

/** Writes one row's outcome. Every path out of a claim ends here. */
async function _finalize(
  context: WorkerContext,
  id: string,
  values: UpdateObject<Database, "outbound_emails">,
): Promise<void> {
  await context.database
    .updateTable("outbound_emails")
    .set(values)
    .where("id", "=", id)
    .execute();
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
async function _claim(context: WorkerContext, id: string): Promise<boolean> {
  const claimed = await context.database
    .updateTable("outbound_emails")
    .set({ state: "sending" })
    .where("id", "=", id)
    .where("state", "=", "queued")
    .executeTakeFirst();
  return Number(claimed.numUpdatedRows) === 1;
}

/** Whether the provider has asked us to stop writing to this address. */
async function _isSuppressed(
  context: WorkerContext,
  address: string,
): Promise<boolean> {
  const suppression = await context.database
    .selectFrom("email_suppressions")
    .select("id")
    .where("address", "=", address)
    .where("cleared_at", "is", null)
    .executeTakeFirst();
  return suppression !== undefined;
}

/**
 * One kind's renderer, or `undefined` for a kind whose copy is not written
 * yet.
 *
 * `outbound_emails.kind` is a `string`: its vocabulary is a SQLite CHECK
 * constraint, not a type, so this lookup has to be able to miss. Widening the
 * registry to a `Record` is what makes `noUncheckedIndexedAccess` supply the
 * `undefined` the caller tests for, which is why no cast is needed.
 */
function _rendererFor(kind: string): EmailRenderer | undefined {
  const renderers: Record<string, EmailRenderer> = EMAIL_RENDERERS;
  return renderers[kind];
}

/**
 * Renders and sends one claimed row, and writes down what happened.
 *
 * Rendering is inside the `try` on purpose: a payload that cannot be parsed or
 * rendered is recorded as `render_failed` and retried on the same schedule as
 * a refusal, rather than throwing out of the pass and stranding the row in
 * `sending`.
 */
async function _deliver(options: DeliverOptions): Promise<RowOutcome> {
  const { context, row, render, fromAddress, sender } = options;
  const { fromName, now } = context;

  try {
    // The row is the boundary: `payload_json` is whatever SQLite holds, and
    // the kind is a string the type system cannot narrow here. The renderer
    // checks the payload against its own kind's schema before touching it,
    // so a row an older build wrote fails here rather than rendering wrong.
    const rendered = render(JSON.parse(row.payload_json));
    const result = await sender.send({
      from:
        fromName === undefined ? fromAddress : `${fromName} <${fromAddress}>`,
      to: row.to_address,
      subject: row.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: row.idempotency_key,
    });
    await _finalize(context, row.id, {
      state: "sent",
      sent_at: now,
      from_address: fromAddress,
      // The column is nullable, and this is the one place the provider's
      // silence has to become the `null` SQLite stores.
      provider_message_id: result.providerMessageId ?? null,
      last_error_code: null,
      last_error_message: null,
      ...makeScrubPatchFromKind(row.kind),
    });
    return "sent";
  } catch (error: unknown) {
    const attempts = row.attempts + 1;
    const backoffSeconds = RETRY_BACKOFF_SECONDS[attempts - 1];
    const isTerminal = backoffSeconds === undefined;
    await _finalize(context, row.id, {
      state: isTerminal ? "failed" : "queued",
      attempts,
      next_attempt_at: isTerminal ? null : _shift(now, backoffSeconds),
      last_error_code:
        error instanceof MailSendError ? error.code : "render_failed",
      last_error_message:
        error instanceof Error ? error.message : String(error),
      ...(isTerminal ? makeScrubPatchFromKind(row.kind) : {}),
    });
    return "failed";
  }
}

/**
 * Puts a claimed row back, because the instance cannot send yet.
 *
 * **A configuration gap is not a delivery attempt.** `attempts` is left
 * exactly where it was, so the queue drains by itself the moment an admin
 * fills the setting in, rather than having burned all five attempts in the
 * two and a half hours they spent reading the setup page.
 */
async function _defer(
  context: WorkerContext,
  row: OutboundEmailRow,
): Promise<RowOutcome> {
  await _finalize(context, row.id, {
    state: "queued",
    next_attempt_at: _shift(context.now, CONFIGURATION_RETRY_SECONDS),
    last_error_code:
      context.fromAddress === undefined
        ? "from_address_unset"
        : "provider_unconfigured",
    last_error_message: "Mail is not configured, so nothing was attempted.",
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
async function _processRow(
  context: WorkerContext,
  row: OutboundEmailRow,
): Promise<RowOutcome> {
  const claimed = await _claim(context, row.id);
  if (!claimed) {
    return "skipped";
  }

  if (
    row.kind !== "sign_in_code" &&
    (await _isSuppressed(context, row.to_address))
  ) {
    await _finalize(context, row.id, {
      state: "suppressed",
      last_error_code: "address_suppressed",
      last_error_message:
        "The provider has asked us to stop writing to this address.",
      ...makeScrubPatchFromKind(row.kind),
    });
    return "suppressed";
  }

  const { fromAddress, sender } = context;
  if (fromAddress === undefined || sender === undefined) {
    return await _defer(context, row);
  }

  const render = _rendererFor(row.kind);
  if (render === undefined) {
    await _finalize(context, row.id, {
      state: "failed",
      last_error_code: "no_template",
      last_error_message: `No copy is written for ${row.kind} yet.`,
      // Terminal like any other, so it scrubs like any other. Unreachable for
      // `sign_in_code` while that kind has copy, and reachable the moment a
      // later step ships a caller whose template lands in a following commit.
      ...makeScrubPatchFromKind(row.kind),
    });
    return "failed";
  }

  return await _deliver({ context, row, render, fromAddress, sender });
}

/**
 * The selection `apis/notifications.md` § Claiming, retrying and scrubbing
 * writes verbatim: queued, due, and past whatever backoff it is serving.
 */
async function _selectEligible(
  database: Kysely<Database>,
  now: string,
  limit: number,
): Promise<OutboundEmailRow[]> {
  return await database
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
    .limit(limit)
    .execute();
}

/**
 * Runs one pass over `outbound_emails`.
 *
 * Selection is `apis/notifications.md` § Claiming, retrying and scrubbing
 * verbatim: `state = 'queued'`, `send_after <= now`, and either no
 * `next_attempt_at` or one that has arrived. Each row is then claimed with a
 * conditional `UPDATE` and carried to its end by `_processRow`.
 *
 * **A row seen mid-flight is never picked up again.** Only `queued` is
 * selected, so a process that dies between the claim and the finalise leaves
 * its row in `sending` and nothing here recovers it. That is deliberate: a
 * reaper cannot tell a crashed worker from a slow one, and re-sending a
 * message the provider already accepted is the worse of the two failures.
 *
 * Nothing from `payload_json` is ever logged: it holds a live sign-in code.
 *
 * @param options.database The catalog handle.
 * @param options.sender Undefined when `RESEND_API_KEY` is unset.
 * @param options.now The instant the pass runs at.
 * @param options.batchSize How many rows to claim, for tests.
 */
export async function runMailQueueOnce(options: {
  database: Kysely<Database>;
  sender: MailSender | undefined;
  now: string;
  batchSize?: number;
}): Promise<MailWorkerSummary> {
  const { database, sender, now } = options;
  const summary: MailWorkerSummary = {
    sentCount: 0,
    failedCount: 0,
    suppressedCount: 0,
    deferredCount: 0,
  };

  const settings = await readInstanceSettings(database, [
    "mail.from_address",
    "mail.from_name",
  ]);
  const context: WorkerContext = {
    database,
    sender,
    now,
    // The settings module answers `null` for a cleared key, which is what
    // clearing one puts on the wire. Everything below here is undefined-based.
    fromAddress: settings["mail.from_address"] ?? undefined,
    fromName: settings["mail.from_name"] ?? undefined,
  };

  const eligible = await _selectEligible(
    database,
    now,
    options.batchSize ?? BATCH_SIZE,
  );

  for (const row of eligible) {
    const outcome = await _processRow(context, row);
    if (outcome !== "skipped") {
      summary[SUMMARY_KEY[outcome]] += 1;
    }
  }

  return summary;
}
