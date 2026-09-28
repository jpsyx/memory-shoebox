import type {
  OutboundEmailKind,
  OutboundEmailState,
  OutboundEmailTriggerKind,
} from "@memory-shoebox/shared";

/**
 * One setting, scoped to the whole instance or to one member.
 *
 * **A fresh instance holds zero rows and still renders correctly**: every key
 * resolves from `SETTING_DEFINITIONS` in `packages/shared`, which owns each
 * key's Zod schema, its default and the scopes it permits. A row here is an
 * override somebody wrote, never a seed.
 *
 * `scope_id` is polymorphic and so carries no foreign key: it is null for an
 * instance row and a member id for a member row, which a `CHECK` enforces.
 */
export type SettingsTable = {
  id: string;
  scope: string;
  scope_id: string | null;
  key: string;
  value: string;
  updated_at: string;
  updated_by_member_id: string | null;
};

/**
 * One message, in a table that is both the queue and the permanent log.
 *
 * `to_address` is denormalised because an invitation has no member yet and the
 * address a message went to must survive a later change. `payload_json` holds
 * **resolved values, not ids**, so a retry a day later renders the same
 * message even if the comment was edited or the item deleted.
 *
 * `idempotency_key` is the only thing standing between a retried handler and
 * two hundred duplicate emails, which is why it is `NOT NULL` as well as
 * unique: every kind has a recipe for it.
 *
 * `trigger_id` carries **no foreign key**, deliberately: the trigger can be
 * deleted and the mail record must outlive it.
 *
 * **`kind`, `trigger_kind` and `state` are the shared unions, not `string`.**
 * Each is a closed vocabulary a `CHECK` already enforces, and typing them here
 * is what makes `row.kind !== "sign_in_code"` and `state: "sending"` checked
 * rather than spelled. `delivery_state` is deliberately still `string`:
 * migration 0007 says the provider owns that vocabulary, and narrowing it
 * would reject an unknown future event and lose the record of a bounce.
 *
 * A `sign_in_code` row is scrubbed once terminal, and `subject` is scrubbed
 * with it, because the six digits are deliberately in the subject line so the
 * code reads off a lock screen. Both columns are rewritten rather than nulled
 * (`payload_json` to `{}`, `subject` to "Your code"), so both stay `NOT NULL`.
 */
export type OutboundEmailsTable = {
  id: string;
  kind: OutboundEmailKind;
  to_address: string;
  to_member_id: string | null;
  from_address: string | null;
  subject: string;
  payload_json: string;
  trigger_kind: OutboundEmailTriggerKind;
  trigger_id: string;
  idempotency_key: string;
  state: OutboundEmailState;
  send_after: string;
  attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  provider_request_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  delivery_state: string | null;
  delivery_updated_at: string | null;
  created_at: string;
  sent_at: string | null;
};

/**
 * One provider webhook about one message: delivered, bounced, complained.
 *
 * `UNIQUE (email_id, event, occurred_at)` is what makes a replayed webhook
 * harmless, and all three columns are `NOT NULL` so that it rejects what it
 * appears to: SQLite counts distinct nulls as distinct inside a unique index.
 */
export type EmailDeliveryEventsTable = {
  id: string;
  email_id: string;
  event: string;
  occurred_at: string;
  received_at: string;
  detail_json: string | null;
};

/**
 * One address the provider has told us to stop writing to.
 *
 * **A suppressed address still gets sign-in codes.** A spam complaint must
 * never lock a family member out of their own archive, and the repeated
 * failure is itself the diagnostic. Every other kind addressed to a suppressed
 * address is written and then set `state = 'suppressed'` without a send.
 *
 * `cleared_at` lifts the suppression in place rather than deleting the row, so
 * the record that it once happened survives.
 */
export type EmailSuppressionsTable = {
  id: string;
  address: string;
  reason: string;
  created_at: string;
  cleared_at: string | null;
};

/**
 * One (member, item) pair: whether a print has been in front of somebody, and
 * whether they ever opened it.
 *
 * **Bounded by content rather than by behaviour.** One row per pair forever,
 * so scrolling a 212-item day writes 212 rows the first time and exactly zero
 * every time after, and the table cannot run away however much the archive is
 * used. Neither retention nor rollup is needed.
 *
 * `first_seen_at` and `first_opened_at` are different facts and both get
 * written: opening at full size latches both, a burst's sibling strip latches
 * only the first. There is deliberately **no `last_seen_at`**, because
 * maintaining one is a write on every impression, which is the whole cost the
 * collapse avoids.
 */
export type ItemViewsTable = {
  id: string;
  member_id: string;
  item_id: string;
  first_seen_at: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
};

/**
 * One audit row: wide, sparse, append-only.
 *
 * It records only what the state tables cannot answer later, which is
 * deletions and any change to who may see what or who may do what.
 *
 * **`subject_id` has no foreign key, and that is the central design point.**
 * An audit log outlives its subjects, so an `item_deleted` row must hold a
 * dangling id. Referential integrity here would either forbid the row or
 * cascade it away exactly when it becomes valuable.
 *
 * `actor_label`, `subject_label` and `device_label` are all denormalised so
 * the log reads correctly with no join after the rows it describes are gone.
 * The third is the one that looks optional and is not: `device_id` is
 * `SET NULL` to `sessions`, which fall out at 30 days idle, so without it most
 * of the log would read "device no longer known".
 *
 * **No retention rule**, deliberately: the first question anybody asks of an
 * audit log is about something old.
 */
export type ActivityEventsTable = {
  id: string;
  kind: string;
  occurred_at: string;
  actor_member_id: string | null;
  actor_label: string;
  subject_kind: string;
  subject_id: string | null;
  subject_label: string;
  device_id: string | null;
  device_label: string | null;
  detail_json: string | null;
};
