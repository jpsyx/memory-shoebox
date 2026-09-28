/** The subject a scrubbed `sign_in_code` row keeps. */
const SCRUBBED_SUBJECT = "Your code";

/** The payload a scrubbed row keeps: valid JSON, holding nothing. */
const SCRUBBED_PAYLOAD_JSON = "{}";

/**
 * The scrub `data-models.md` § `outbound_emails` requires on a terminal
 * `sign_in_code` row, as the columns that have to be written.
 *
 * **Both columns, not one.** The six digits are deliberately in the subject
 * line so the code reads off a lock screen, which makes `subject` the more
 * exposed of the two: scrubbing `payload_json` alone would leave a permanent
 * log of live-looking codes sitting beside the address each was sent to. Both
 * are rewritten rather than nulled, because both are `NOT NULL`.
 *
 * **One definition, because a reader of the table cannot tell which code path
 * finalised a row.** Three of them do it: `runMailQueueOnce.ts` when a send
 * ends `sent` or `suppressed`, or `failed` with no attempt left behind it;
 * `runMailQueueOnce.ts` again when a row's kind has no copy written yet and
 * cannot be rendered at all; and `enqueueEmail.ts` when `public.base_url` is
 * unset and the row is born terminal. Two spellings of "scrubbed" would read
 * as two different states.
 * All three are covered by tests asserting the literal subject, which is what
 * makes a change here go red everywhere rather than nowhere.
 *
 * Plain strings rather than a Kysely `UpdateObject`, because the two callers
 * use the answer differently: `runMailQueueOnce.ts` spreads it into an
 * `UPDATE`, and `enqueueEmail.ts` reads the values to choose what its
 * `INSERT` writes.
 *
 * @param kind The row's `outbound_emails.kind`. A `string` rather than a
 *   union, because that column's vocabulary is a SQLite CHECK constraint.
 * @returns The columns to rewrite, empty for a kind that keeps what it holds.
 */
export function makeScrubPatchFromKind(kind: string): {
  payload_json?: string;
  subject?: string;
} {
  return kind === "sign_in_code"
    ? { payload_json: SCRUBBED_PAYLOAD_JSON, subject: SCRUBBED_SUBJECT }
    : {};
}
