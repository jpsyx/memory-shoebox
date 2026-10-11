import { z } from "zod";
import type {
  WorkerContext,
  OutboundEmailRow,
  RowOutcome,
} from "./mailQueue.types.ts";
import type { EmailService } from "./EmailService/EmailService.types.ts";
import type { EmailRenderer } from "./templates/emailTemplates.constants.ts";
import { MailSendError } from "./MailSendError.ts";
import { makeScrubPatchFromKind } from "./makeScrubPatchFromKind.ts";
import { finalizeQueuedEmail } from "./finalizeQueuedEmail.ts";

/** The one message to send, and the two things needed to address it. */
type DeliverOptions = {
  context: WorkerContext;
  row: OutboundEmailRow;
  render: EmailRenderer;
  fromAddress: string;
  sender: EmailService;
};

/**
 * One minute, five, twenty-five, then two hours, and then it is over.
 *
 * Long enough to ride out a provider outage, short enough that a sign-in code
 * is either useful or dead well inside the ten minutes it is good for. Four
 * delays is what makes the fifth attempt the last: a refusal with no delay
 * left behind it is terminal, which is where the five comes from.
 */
const RETRY_BACKOFF_SECONDS = [60, 300, 1500, 7200];

async function _getOrFreezeSender({
  context,
  row,
  fromAddress,
}: Readonly<{
  context: WorkerContext;
  row: OutboundEmailRow;
  fromAddress: string;
}>): Promise<{ from: string; address: string }> {
  if (row.sender_snapshot_json !== null) {
    return z
      .object({ from: z.string(), address: z.string() })
      .parse(JSON.parse(row.sender_snapshot_json));
  }
  const identity = {
    from:
      context.fromName === undefined
        ? fromAddress
        : `${context.fromName} <${fromAddress}>`,
    address: fromAddress,
  };
  await context.database
    .updateTable("outbound_emails")
    .set({ sender_snapshot_json: JSON.stringify(identity) })
    .where("id", "=", row.id)
    .where("state", "=", "sending")
    .execute();
  return identity;
}

async function _isStillSending(
  options: Readonly<{
    context: WorkerContext;
    row: OutboundEmailRow;
  }>,
): Promise<boolean> {
  if (options.row.kind !== "invitation") {
    return true;
  }
  const current = await options.context.database
    .selectFrom("outbound_emails")
    .select("state")
    .where("id", "=", options.row.id)
    .executeTakeFirstOrThrow();
  return current.state === "sending";
}

async function _recordDeliveryFailure(
  options: Readonly<{
    context: WorkerContext;
    row: OutboundEmailRow;
    error: unknown;
  }>,
): Promise<RowOutcome> {
  const { context, row, error } = options;
  const { now } = context;
  const attempts = row.attempts + 1;
  const backoffSeconds = RETRY_BACKOFF_SECONDS[attempts - 1];
  const isTerminal = backoffSeconds === undefined;
  await finalizeQueuedEmail({
    context,
    id: row.id,
    values: {
      state: isTerminal ? "failed" : "queued",
      attempts,
      next_attempt_at: isTerminal
        ? null
        : new Date(Date.parse(now) + backoffSeconds * 1000).toISOString(),
      last_error_code:
        error instanceof MailSendError ? error.code : "render_failed",
      last_error_message:
        error instanceof Error ? error.message : String(error),
      ...(isTerminal ? makeScrubPatchFromKind(row.kind) : {}),
    },
  });
  return "failed";
}

/**
 * Renders and sends one claimed row, and writes down what happened.
 *
 * Rendering is inside the `try` on purpose: a payload that cannot be parsed or
 * rendered is recorded as `render_failed` and retried on the same schedule as
 * a refusal, rather than throwing out of the pass and stranding the row in
 * `sending`.
 */
export async function deliverQueuedEmail(
  options: Readonly<DeliverOptions>,
): Promise<RowOutcome> {
  const { context, row, render, fromAddress, sender } = options;
  const { now } = context;

  try {
    // The renderer validates the stored payload before rendering.
    const rendered = await render(JSON.parse(row.payload_json));
    // A replacement may have committed while this row was rendering.
    if (!(await _isStillSending({ context, row }))) {
      return "skipped";
    }
    const identity = await _getOrFreezeSender({ context, row, fromAddress });
    if (!(await _isStillSending({ context, row }))) {
      return "skipped";
    }
    const result = await sender.send({
      from: identity.from,
      to: row.to_address,
      subject: row.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: row.idempotency_key,
    });
    await finalizeQueuedEmail({
      context,
      id: row.id,
      values: {
        state: "sent",
        sent_at: now,
        from_address: identity.address,
        // The column is nullable, and this is the one place the provider's
        // silence has to become the `null` SQLite stores.
        provider_message_id: result.providerMessageId ?? null,
        last_error_code: null,
        last_error_message: null,
        ...makeScrubPatchFromKind(row.kind),
      },
    });
    return "sent";
  } catch (error: unknown) {
    return _recordDeliveryFailure({ context, row, error });
  }
}
