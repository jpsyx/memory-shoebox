import type { Kysely, Transaction } from "kysely";
import type { EmailCommon, EnqueueEmailInput } from "@memory-shoebox/shared";
import { createId } from "../db/ids.ts";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "../settings/instanceSettings.ts";
import { makeScrubPatchFromKind } from "./makeScrubPatchFromKind.ts";
import {
  EMAIL_TEMPLATES,
  type BuiltEmailKind,
  type EmailPayloadExtras,
} from "./templates/registry.ts";

/** Either a handle or a transaction: the enqueue runs inside the caller's. */
export type MailExecutor = Kysely<Database> | Transaction<Database>;

/** What the enqueue did. */
export type EnqueueEmailResult = {
  emailId: string;
  /**
   * `queued` is the normal case. `failed` means `public.base_url` was unset,
   * which is terminal. `already_enqueued` means the idempotency key was
   * already taken, which is a retried handler doing exactly what it should.
   */
  state: "queued" | "failed" | "already_enqueued";
};

/**
 * Where a member turns a notification off. Not a setting: it is the account
 * surface, and the only variable part of it is the instance's own address.
 */
function _preferencesUrl(kind: BuiltEmailKind, baseUrl: string): string | null {
  // `sign_in_code` is the one kind with no switch to offer, so its footer
  // omits the link rather than offering something that does not work.
  return kind === "sign_in_code" ? null : `${baseUrl}/account`;
}

/**
 * Writes one outbound message, inside the caller's transaction.
 *
 * **It does not throw on a mail problem.** The triggering transaction is
 * always doing something else that has to succeed: the upload latch is
 * deliberately on `settled_at` rather than `notified_at` so a batch can finish
 * while mail is down, and a sign-in code that cannot be mailed must still
 * exist for the resend path (`apis/notifications.md` § When `public.base_url`
 * is unset).
 *
 * **The boundary of that guarantee, stated because it was measured rather than
 * assumed.** An unset, empty or relative `public.base_url` writes a `failed`
 * row and returns; a duplicate `idempotency_key` returns `already_enqueued`.
 * A SQLite error still propagates: a `toMemberId` naming no member violates
 * the foreign key, and an unmigrated database fails the settings read. Those
 * are programming errors rather than mail being down, and a caller that has
 * just written the member row it is mailing cannot hit the first one.
 *
 * **It composes `EmailCommon` and derives the subject**, rather than taking
 * both from the caller as `notifications.md` § The enqueue interface writes
 * it. Only code here can discover that `public.base_url` is unset and still
 * write the row, and `invitation`'s subject interpolates the Shoebox name,
 * which a caller does not hold. Recorded as a deliberate deviation in the step
 * design.
 *
 * **With no absolute `public.base_url` the row is written `failed`** with
 * `attempts = 0` and `last_error_code = 'base_url_unset'`. The consequence is
 * stated rather than mitigated: those messages are lost, not retried, and
 * `GET /api/mail/health` reports it above every other diagnostic because every
 * other symptom is downstream of it.
 *
 * **That row is terminal, so a `sign_in_code` is scrubbed on the way in**, by
 * the same `scrub.ts` the worker finalises rows through. The worker is not
 * the only place a row goes terminal, and this is the place it happens first:
 * a fresh Shoebox holds no settings rows at all, so an unset
 * `public.base_url` is the normal state on the day the first sign-in codes
 * are asked for.
 *
 * @param options.executor The caller's transaction, or a plain handle.
 * @param options.input The kind, the recipient, the idempotency key and the
 *   kind-specific payload fields.
 * @param options.now Overridable so a test can hold time still.
 */
export async function enqueueEmail<Kind extends BuiltEmailKind>(options: {
  executor: MailExecutor;
  input: EnqueueEmailInput<Kind, EmailPayloadExtras[Kind]>;
  now?: string;
}): Promise<EnqueueEmailResult> {
  const { executor, input } = options;
  const now = options.now ?? new Date().toISOString();

  const settings = await readInstanceSettings(executor, [
    "shoebox.name",
    "shoebox.timezone",
    "public.base_url",
  ]);
  const baseUrl = settings["public.base_url"];

  // `getSettingValueFromStoredValue` returns the default, null, for a missing
  // row and for a stored value that is not an absolute http(s) URL, so this one
  // check covers all three failures the document names: missing, empty, and not
  // absolute.
  const isBaseUrlSet = baseUrl !== null;

  const common: EmailCommon = {
    shoeboxName: settings["shoebox.name"],
    // The empty string on the failed path. The row is terminal and is never
    // rendered, and for every kind but `sign_in_code` the payload is kept,
    // because the requeue that a later `public.base_url` triggers recomposes
    // its links from it. `scrubbedColumns` below is where that one kind parts
    // company with the rest.
    baseUrl: baseUrl ?? "",
    timezone: settings["shoebox.timezone"],
    toDisplayName: input.toDisplayName,
    preferencesUrl: isBaseUrlSet ? _preferencesUrl(input.kind, baseUrl) : null,
  };

  const payload = { ...common, ...input.payload };
  const template = EMAIL_TEMPLATES[input.kind];
  const subject = template.subject(payload);

  // `data-models.md` § `outbound_emails` requires the scrub on a terminal
  // `sign_in_code` row, and a `base_url_unset` row is terminal the moment it
  // is written. Which columns that means, and for which kinds, is `scrub.ts`'s
  // answer rather than this file's: the worker takes rows terminal too, and
  // one definition of "scrubbed" is what lets a reader of the table stop
  // caring which path a row arrived by. All this decides is that a row with
  // no absolute base URL has nowhere left to go.
  //
  // **The payload goes with it, for this kind only.** The requeue that a later
  // `public.base_url` triggers exists to recover a message once the links can
  // be composed, and a sign-in code is good for ten minutes: a code requeued
  // hours or days later is dead on arrival, so there is nothing to recover and
  // a permanent record of a live-looking code to remove. Every other kind
  // keeps its payload untouched, which is what leaves the requeue something to
  // work with.
  //
  // Note for whoever builds the requeue (step 8a): it selects on
  // `last_error_code = 'base_url_unset'`, which matches these rows too, and it
  // would find `{}` where it expects a payload. Skip `sign_in_code` there
  // rather than trying to recompose it. No guard is built here for a caller
  // that does not exist yet.
  const scrubbedColumns = isBaseUrlSet
    ? {}
    : makeScrubPatchFromKind(input.kind);

  const emailId = createId();
  const inserted = await executor
    .insertInto("outbound_emails")
    .values({
      id: emailId,
      kind: input.kind,
      to_address: input.toAddress.trim().toLowerCase(),
      to_member_id: input.toMemberId,
      from_address: null,
      subject: scrubbedColumns.subject ?? subject,
      payload_json: scrubbedColumns.payload_json ?? JSON.stringify(payload),
      trigger_kind: input.triggerKind,
      trigger_id: input.triggerId,
      idempotency_key: input.idempotencyKey,
      state: isBaseUrlSet ? "queued" : "failed",
      send_after: input.sendAfter ?? now,
      attempts: 0,
      next_attempt_at: null,
      provider_message_id: null,
      provider_request_id: null,
      last_error_code: isBaseUrlSet ? null : "base_url_unset",
      last_error_message: isBaseUrlSet
        ? null
        : "public.base_url is not set, so this message has no absolute link and was not sent.",
      delivery_state: null,
      delivery_updated_at: null,
      created_at: now,
      sent_at: null,
    })
    .onConflict((conflict) => {
      return conflict.column("idempotency_key").doNothing();
    })
    .executeTakeFirst();

  if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
    // The unique index did its job. This is a retried handler, not an error:
    // it is the only thing standing between one and two hundred duplicates.
    const existing = await executor
      .selectFrom("outbound_emails")
      .select("id")
      .where("idempotency_key", "=", input.idempotencyKey)
      .executeTakeFirstOrThrow();
    return { emailId: existing.id, state: "already_enqueued" };
  }

  return { emailId, state: isBaseUrlSet ? "queued" : "failed" };
}
