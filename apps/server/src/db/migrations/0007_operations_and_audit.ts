import { sql, type Kysely } from "kysely";

/**
 * Operations and audit: what the instance is configured to do, what it has
 * tried to send, and what it will still be able to answer once the rows those
 * answers were about are gone.
 *
 * Six tables, and this migration completes the schema. Thirty-three tables,
 * and after it every foreign key in the database points at a table that
 * exists and every delete rule in `data-models.md` is enforced behaviour.
 *
 * Four things about the group are worth reading before changing anything.
 *
 * **`settings` holds no rows on a fresh instance, and must not be seeded.**
 * Every key resolves from `SETTING_DEFINITIONS` in `packages/shared`, which
 * owns each key's Zod schema, its default and the scopes it permits. A default
 * written into DDL is a default that has to be migrated when it changes, and a
 * `"My Shoebox"` sitting in a `CREATE TABLE` is a name nobody can find
 * (`data-models.md` § `settings`).
 *
 * **Three of the tables deliberately hold ids that point at nothing.**
 * `outbound_emails.trigger_id`, `activity_events.subject_id` and
 * `email_suppressions.address` are all references in the reader's sense and
 * none is a foreign key. The mail record and the audit row outlive their
 * subjects by definition, so referential integrity there would either forbid
 * the row or cascade it away exactly at the moment it becomes valuable.
 *
 * **Every label on `activity_events` is denormalised, including the third
 * one.** `actor_label` and `subject_label` are the obvious two. `device_label`
 * is the one that looks optional: `device_id` is `SET NULL` to `sessions`,
 * which fall out at 30 days idle, so without it surface 18 reads "device no
 * longer known" on every row older than a month, which is most of the log.
 *
 * **The uniques here are the null trap's fourth appearance in this schema.**
 * SQLite counts distinct nulls as distinct inside a unique index, so a unique
 * touching a nullable column rejects less than it appears to. Two of the five
 * below are partial for that reason and say so; the other three are built from
 * `NOT NULL` columns only, which is what makes them reject what they look like
 * they reject. `UNIQUE (email_id, event, occurred_at)` is the one that had to
 * be checked hardest: a webhook whose `occurred_at` were nullable would replay
 * straight past it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // Scoped key/value, with the type registry in `packages/shared`.
  //
  // PRODUCT.md requires instance-level and per-member settings from the start,
  // and typed columns on a singleton row only allow for that by promising a
  // second table later. The loss is database-level typing, which this codebase
  // recovers in the layer where it belongs.
  await database.schema
    .createTable("settings")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("scope", "text", (column) => {
      return column.notNull().check(sql`scope IN ('instance', 'member')`);
    })
    // Null for an instance row, a member id for a member row. **No foreign
    // key**, because the column is polymorphic by construction: SQLite cannot
    // make a reference conditional on `scope`, and the same shape recurs in
    // `outbound_emails.trigger_id` and `activity_events.subject_id`. The
    // `CHECK` below is what keeps the pair coherent, and a member is never
    // hard-deleted, so there is no dangling id for a foreign key to catch.
    .addColumn("scope_id", "text")
    // Never constrained to a list. The registry owns which keys exist, so
    // adding `shoebox.timezone` is a change to one object in `packages/shared`
    // rather than a migration.
    .addColumn("key", "text", (column) => {
      return column.notNull();
    })
    // A JSON-encoded scalar, decoded through the key's Zod schema.
    .addColumn("value", "text", (column) => {
      return column.notNull();
    })
    .addColumn("updated_at", "text", (column) => {
      return column.notNull();
    })
    // SET NULL: a setting keeps its value when the member who set it goes.
    // Attribution here is incidental, unlike `comments.author_member_id`.
    .addColumn("updated_by_member_id", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    // An equivalence, not an implication: a member row must carry a scope id
    // and an instance row must not. Written this way rather than as two
    // `CHECK`s so that both directions fail, including the instance row that
    // quietly carries somebody's member id and would otherwise be invisible
    // to the partial index below.
    .addCheckConstraint(
      "settings_scope_id_matches_scope",
      sql`(scope = 'member') = (scope_id IS NOT NULL)`,
    )
    .execute();

  // One value per key for the instance.
  //
  // **Must be partial, and this is the whole reason there are two indexes
  // rather than one.** `scope_id` is null on every instance row, and SQLite
  // counts distinct nulls as distinct, so a plain
  // `UNIQUE (scope, scope_id, key)` would happily accept two instance rows for
  // `shoebox.name` and leave the reader to discover which one wins.
  await database.schema
    .createIndex("settings__one_instance_value")
    .unique()
    .on("settings")
    .column("key")
    // `scope` is not one of the index's own columns, so Kysely's typed `where`
    // (which only accepts columns declared above) cannot reach it; `sql.ref`
    // is the escape hatch the library's own docs show.
    .where(sql.ref("scope"), "=", "instance")
    .execute();

  // One value per key per member. Partial for symmetry with the index above
  // rather than out of necessity: `scope_id` is `NOT NULL` on these rows by
  // the `CHECK`, so it is the predicate that keeps the two indexes from
  // overlapping, and it is also the member's own settings lookup.
  await database.schema
    .createIndex("settings__one_member_value")
    .unique()
    .on("settings")
    .columns(["scope_id", "key"])
    .where(sql.ref("scope"), "=", "member")
    .execute();

  // One message. Both the queue and the permanent log, and the queue half is
  // the shorter-lived one: a row is claimed, sent and then kept forever.
  await database.schema
    .createTable("outbound_emails")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // The seven kinds the product sends. A reaction is deliberately not one of
    // them and must not become one: it is one tap, meant to cost the person
    // leaving it nothing, which it stops doing the moment it costs somebody
    // else an email.
    .addColumn("kind", "text", (column) => {
      return column.notNull().check(
        sql`kind IN (
          'sign_in_code', 'invitation', 'upload_session', 'comment',
          'removal_request', 'removal_reminder', 'removal_resolved'
        )`,
      );
    })
    // Denormalised, because an invitation has no member yet and because the
    // address a message actually went to must survive a later change to the
    // member's address. Normalised (trimmed, lowercased) on write.
    .addColumn("to_address", "text", (column) => {
      return column.notNull();
    })
    // SET NULL, and null from the start for a sign-in code typed at an address
    // that is not a member. The address above is the fact; this is the link.
    .addColumn("to_member_id", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    // The envelope sender actually used, which is known at send rather than at
    // enqueue: `mail.from_address` can change, and a row that never left has
    // no answer to give. Null until the worker writes it, and an address
    // rather than a reference: nothing in this schema owns a sending address.
    .addColumn("from_address", "text")
    // Rendered English, stored on the row: this column is the message rather
    // than a payload. **Scrubbed with `payload_json` for a terminal
    // `sign_in_code` row**, to `Your code`, because surface 16 deliberately
    // puts the six digits in the subject line so the code reads off a lock
    // screen. Scrubbing the payload alone would leave the more exposed copy of
    // the two sitting beside the address it was sent to.
    .addColumn("subject", "text", (column) => {
      return column.notNull();
    })
    // **Resolved values, not ids**, so a retry a day later renders the same
    // message even if the comment was edited or the item deleted. Rewritten to
    // `{}` by the scrub, never nulled, which is why this is `NOT NULL`.
    .addColumn("payload_json", "text", (column) => {
      return column.notNull();
    })
    // What caused the message. `item` is in the list and is not an email kind:
    // it is what a `comment` message's link resolves against.
    .addColumn("trigger_kind", "text", (column) => {
      return column.notNull().check(
        sql`trigger_kind IN (
          'sign_in_code', 'invitation', 'upload_session',
          'comment', 'removal_request', 'item'
        )`,
      );
    })
    // **No foreign key, deliberately**: the trigger can be deleted and the
    // mail record must outlive it. It is also what the `base_url_unset`
    // requeue recomposes the absolute links from, so it has to still be here
    // after the comment it names is gone.
    .addColumn("trigger_id", "text", (column) => {
      return column.notNull();
    })
    // **The only thing standing between a retried handler and two hundred
    // duplicate emails.** Every kind has a recipe, so this is `NOT NULL` and
    // the unique below is a plain one that genuinely rejects a duplicate.
    .addColumn("idempotency_key", "text", (column) => {
      return column.notNull();
    })
    // `sent`, `failed`, `cancelled` and `suppressed` are terminal. Deleting a
    // comment cancels its notification while `queued` and never once
    // `sending`: a message already handed to the provider cannot be recalled,
    // and pretending otherwise in the schema invites a handler that tries.
    .addColumn("state", "text", (column) => {
      return column.notNull().check(
        sql`state IN (
          'queued', 'sending', 'sent', 'failed', 'cancelled', 'suppressed'
        )`,
      );
    })
    // The earliest the message may go. Equal to `created_at` for every caller
    // but the weekly removal reminder, which is the only one that defers.
    .addColumn("send_after", "text", (column) => {
      return column.notNull();
    })
    .addColumn("attempts", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    // The retry schedule, and **nullable on purpose**: the worker selects
    // `state = 'queued' AND send_after <= :now AND (next_attempt_at IS NULL OR
    // next_attempt_at <= :now)`, so a fresh row with nothing to back off from
    // is eligible without the enqueue having to invent a time
    // (`apis/notifications.md` § Claiming, retrying and scrubbing).
    .addColumn("next_attempt_at", "text")
    // The provider's own identifiers, for correlating a webhook and for the
    // support conversation when one is needed.
    .addColumn("provider_message_id", "text")
    .addColumn("provider_request_id", "text")
    // `base_url_unset` is the one written before any send is attempted, and it
    // is the code the requeue looks for. Not constrained to a list: the
    // provider's own refusals arrive as data and are carried through verbatim
    // to the admin banner rather than parsed.
    .addColumn("last_error_code", "text")
    .addColumn("last_error_message", "text")
    // What the webhooks have since said about the message. Not constrained to
    // a list either, and for a stronger reason than the column above: the
    // provider owns this vocabulary, and a `CHECK` here would reject an
    // unknown future event and lose the record of a bounce rather than
    // recording something unrecognised.
    .addColumn("delivery_state", "text")
    .addColumn("delivery_updated_at", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("sent_at", "text")
    .execute();

  // The idempotency recipe, enforced. `idempotency_key` is `NOT NULL`, so this
  // is a plain unique with no null for SQLite to count as distinct: the second
  // `invite:<invitation_id>:<send_count>` is rejected rather than sent, and a
  // deliberate resend is a different key because `send_count` moved.
  await database.schema
    .createIndex("outbound_emails__idempotency_key")
    .unique()
    .on("outbound_emails")
    .column("idempotency_key")
    .execute();

  // The worker's claim: "what is due". Leads on `state` because the claim is
  // scoped to `queued` and everything else in the table is terminal.
  await database.schema
    .createIndex("outbound_emails__state_next_attempt")
    .on("outbound_emails")
    .columns(["state", "next_attempt_at"])
    .execute();

  // The health grouping behind `GET /api/mail/health`: one `GROUP BY state`
  // with `min`/`max` over `created_at`, which this index answers without
  // touching the table.
  await database.schema
    .createIndex("outbound_emails__state_created")
    .on("outbound_emails")
    .columns(["state", "created_at"])
    .execute();

  // One provider webhook about one message.
  await database.schema
    .createTable("email_delivery_events")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE: an event has no meaning without the message it is about. This
    // is also the only foreign key among the six tables in this migration.
    .addColumn("email_id", "text", (column) => {
      return column
        .notNull()
        .references("outbound_emails.id")
        .onDelete("cascade");
    })
    // The provider's own event name, unconstrained for the same reason
    // `delivery_state` is: losing an unrecognised bounce is worse than storing
    // a word we did not expect.
    .addColumn("event", "text", (column) => {
      return column.notNull();
    })
    // When the provider says it happened. **`NOT NULL` is what makes the
    // unique below work at all**: SQLite counts distinct nulls as distinct, so
    // a nullable `occurred_at` would let a replayed webhook through every
    // time. A payload without a timestamp takes `received_at` rather than a
    // null, because a replay-safety index that silently stops checking is
    // worse than a slightly approximate instant.
    .addColumn("occurred_at", "text", (column) => {
      return column.notNull();
    })
    // When we heard about it, which is a different fact and worth keeping: the
    // gap between the two is the first thing to look at when delivery states
    // are arriving late.
    .addColumn("received_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("detail_json", "text")
    .execute();

  // Webhook replay safety: providers retry, and the same event delivered twice
  // is one event. All three columns are `NOT NULL`, so this rejects what it
  // appears to. It also leads on `email_id`, so it doubles as the lookup for
  // "every event about this message" and as the index the CASCADE above rides.
  await database.schema
    .createIndex("email_delivery_events__email_event_occurred")
    .unique()
    .on("email_delivery_events")
    .columns(["email_id", "event", "occurred_at"])
    .execute();

  // One address the provider has told us to stop writing to.
  await database.schema
    .createTable("email_suppressions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // Normalised on write, like every other address in the schema. **No
    // foreign key to `members`**: an invited address that bounced may never
    // become a member, and the suppression list is about addresses rather than
    // about people.
    .addColumn("address", "text", (column) => {
      return column.notNull();
    })
    // Why the provider refused. Unconstrained, again because the vocabulary is
    // the provider's.
    .addColumn("reason", "text", (column) => {
      return column.notNull();
    })
    // Not in the model's column list, and added because every other table in
    // the schema records when its row appeared and a suppression that cannot
    // be dated cannot be judged: an admin looking at a suppressed address
    // needs to know whether it happened this morning or last year.
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // Lifting a suppression sets this rather than deleting the row, so the
    // record that it once happened survives. `GET /api/mail/health` counts
    // `WHERE cleared_at IS NULL`.
    .addColumn("cleared_at", "text")
    .execute();

  // One row per address, cleared or not.
  //
  // Not partial on `cleared_at`, deliberately: a re-suppressed address should
  // reuse its row and keep its history rather than accumulate one row per
  // episode, and `address` is `NOT NULL`, so this plain unique rejects the
  // duplicate it looks like it rejects.
  await database.schema
    .createIndex("email_suppressions__address")
    .unique()
    .on("email_suppressions")
    .column("address")
    .execute();

  // One (member, item) pair, and the table that answers both the accent dot
  // and "who has looked at this".
  //
  // **Bounded by content rather than by behaviour, which is the payoff worth
  // writing down here**: one row per pair forever, so scrolling a 212-item day
  // writes 212 rows the first time and exactly zero every time after. Neither
  // retention nor rollup is needed, because the table cannot run away no
  // matter how much the archive is used. Per-impression logging is the trap it
  // avoids, at 400k to 1.2M rows a year against ~12k here.
  await database.schema
    .createTable("item_views")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE on both: a view is a fact about a pair, and it means nothing
    // once either side is gone. This is also why `itemsOpenedCount` on surface
    // 17 falls when an item is deleted, which is correct.
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    // Set once and never updated: the thumbnail has been in front of this
    // person. A burst's sibling strip latches this alone, for every visible
    // sibling, in one batched `INSERT ... ON CONFLICT DO NOTHING`.
    .addColumn("first_seen_at", "text", (column) => {
      return column.notNull();
    })
    // A different fact, and the one surface 17 cares about: opened at full
    // size. Null on a row that was only ever scrolled past, which is what
    // keeps the "scrolled past, never opened" row honest.
    .addColumn("first_opened_at", "text")
    .addColumn("last_opened_at", "text")
    .addColumn("open_count", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    // **Deliberately absent: `last_seen_at`.** Maintaining it reintroduces a
    // write on every impression, which is the whole cost the collapse above
    // avoids, and no question in the brief needs it.
    .execute();

  // The upsert target for the open counter, and the timeline's anti-join for
  // the accent dot. Both columns are `NOT NULL`, so it rejects the duplicate
  // pair it appears to.
  await database.schema
    .createIndex("item_views__member_item")
    .unique()
    .on("item_views")
    .columns(["member_id", "item_id"])
    .execute();

  // The reverse direction: "who has viewed this photograph", at most nine rows
  // on an archive of any size. This is also what lends the `item_id` CASCADE
  // an index, without which deleting one item scans every view ever recorded.
  await database.schema
    .createIndex("item_views__item_member")
    .on("item_views")
    .columns(["item_id", "member_id"])
    .execute();

  // "How many people actually opened this", as against merely scrolled past
  // it, which is the distinction the owner cares about. Partial because the
  // rows with a null `first_opened_at` are exactly the ones it has nothing to
  // count, and on a table heading for a quarter of a million rows that is most
  // of them.
  await database.schema
    .createIndex("item_views__opened_by_item")
    .on("item_views")
    .column("item_id")
    // `first_opened_at` is not one of the index's own columns, so the typed
    // `where` cannot reach it. Same escape hatch as the settings indexes.
    .where(sql.ref("first_opened_at"), "is not", null)
    .execute();

  // Its mirror, and what surface 17 groups by when it counts what each member
  // has opened: `count(*) WHERE first_opened_at IS NOT NULL GROUP BY
  // member_id`. The one query on that surface that scales with the archive.
  await database.schema
    .createIndex("item_views__opened_by_member")
    .on("item_views")
    .column("member_id")
    .where(sql.ref("first_opened_at"), "is not", null)
    .execute();

  // The audit log: wide, sparse, append-only.
  //
  // **It records only what the state tables cannot answer later**, which is
  // deletions and any change to who may see what or who may do what. A
  // comment, a reaction and an upload are all already dated by their own
  // rows, so none of them is written here and surface 18 does not repeat what
  // the timeline shows on its front page.
  await database.schema
    .createTable("activity_events")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // The three families, in the order `data-models.md` gives them: access,
    // authority, destruction. Constrained, unlike the provider vocabularies
    // above, because this list is ours: a kind is added by a developer in a
    // deliberate change, and `apis/notifications.md` maps each one to a family
    // exhaustively, so a kind that exists in one place and not the other is a
    // bug that should fail loudly.
    .addColumn("kind", "text", (column) => {
      return column.notNull().check(
        sql`kind IN (
          'sign_in_code_requested', 'signed_in', 'sign_in_failed',
          'signed_out', 'device_revoked', 'session_expired',
          'member_invited', 'invitation_revoked', 'invitation_accepted',
          'member_role_changed', 'member_removed', 'group_created',
          'group_renamed', 'group_membership_changed', 'group_deleted',
          'item_visibility_changed', 'setting_changed',
          'item_deleted', 'comment_deleted', 'milestone_deleted'
        )`,
      );
    })
    .addColumn("occurred_at", "text", (column) => {
      return column.notNull();
    })
    // SET NULL, and null for an act with no member behind it: a sweeper
    // expiring a session, or a sign-in attempt at an address nobody owns.
    .addColumn("actor_member_id", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    // The name and address **as they were**. `NOT NULL` because the log has to
    // read correctly with no join, so every row carries one even when the
    // actor is the system: an empty "who" column is a row nobody can act on.
    .addColumn("actor_label", "text", (column) => {
      return column.notNull();
    })
    // What the row is about: item, member, group, comment, milestone, setting
    // or session. `apis/notifications.md` types this as a closed union on the
    // wire, so it is closed here too.
    .addColumn("subject_kind", "text", (column) => {
      return column.notNull().check(
        sql`subject_kind IN (
          'item', 'member', 'group', 'comment',
          'milestone', 'setting', 'session'
        )`,
      );
    })
    // **No foreign key at all, and this is the central design point of the
    // table.** An audit log outlives its subjects by definition, so an
    // `item_deleted` row must hold a dangling id. A foreign key would either
    // forbid the row, which loses the only record that the photograph ever
    // existed, or cascade it away exactly when it becomes valuable. Orphan ids
    // are expected and correct, and the client is told not to link blindly.
    //
    // Nullable, because a subject can be named without having an id: a
    // sign-in failure at an unknown address has a kind and a label and nothing
    // to point at.
    .addColumn("subject_id", "text")
    // Denormalised for the same reason as `actor_label`: resolving this
    // through `items` or `members` would break every row that matters.
    .addColumn("subject_label", "text", (column) => {
      return column.notNull();
    })
    // SET NULL, and it fires routinely rather than never: sessions vanish at
    // sign-out and fall out at 30 days idle.
    .addColumn("device_id", "text", (column) => {
      return column.references("sessions.id").onDelete("set null");
    })
    // **Denormalised too, and it is the one that looks optional.** Without it
    // surface 18 reads "device no longer known" on every row older than a
    // month, which is most of the log, precisely because of the SET NULL
    // above. A wide, sparse, append-only table is exactly where one more text
    // column costs nothing. Nullable because an act with no device behind it
    // (a cron expiring a session) has no label to give.
    .addColumn("device_label", "text")
    // The per-kind extras surface 18 renders as a sentence: which roles a
    // change went between, which labels a group gained and lost. Read through
    // a narrow discriminated union and never passed through raw.
    .addColumn("detail_json", "text")
    // **No IP address, no location, no raw user agent beyond the parsed label
    // above** (`data-models.md` § Privacy). There is no GeoIP lookup anywhere
    // in the product, and the logging is meant to read as though a family
    // member might one day see this schema.
    .execute();

  // The feed itself, newest first, which is surface 18 with no filter.
  await database.schema
    .createIndex("activity_events__occurred")
    .on("activity_events")
    .columns(["occurred_at desc"])
    .execute();

  // The family filter. It reads a handful of kinds per family, and it is the
  // caller this index did not have until surface 18 gained the filter.
  await database.schema
    .createIndex("activity_events__kind_occurred")
    .on("activity_events")
    .columns(["kind", "occurred_at desc"])
    .execute();

  // "What has this person done", and what lends the `actor_member_id`
  // SET NULL an index.
  await database.schema
    .createIndex("activity_events__actor_occurred")
    .on("activity_events")
    .columns(["actor_member_id", "occurred_at desc"])
    .execute();

  // "What has happened to this thing", including a thing that no longer
  // exists, which is the read the dangling `subject_id` is for.
  await database.schema
    .createIndex("activity_events__subject_occurred")
    .on("activity_events")
    .columns(["subject_kind", "subject_id", "occurred_at desc"])
    .execute();

  // Not in the model's index list, and here for the same reason
  // `upload_files__by_item` and `removal_requests__by_item` are: the
  // `device_id` SET NULL fires every time a session ends, against a table that
  // grows forever and is never pruned. Without this, every sign-out scans the
  // whole log. Partial because a null `device_id` is exactly the case this
  // index has nothing to find, and after a month most rows are that case.
  await database.schema
    .createIndex("activity_events__by_device")
    .on("activity_events")
    .column("device_id")
    .where("device_id", "is not", null)
    .execute();
}

/**
 * Drops the six tables, children before parents.
 *
 * `email_delivery_events` is the only child inside this migration and goes
 * before `outbound_emails`. The rest are free-standing here: their parents
 * (`members`, `items`, `sessions`) live in earlier migrations, and nothing in
 * the schema references any of these six, which is what being the last
 * migration means.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("activity_events").execute();
  await database.schema.dropTable("item_views").execute();
  await database.schema.dropTable("email_suppressions").execute();
  await database.schema.dropTable("email_delivery_events").execute();
  await database.schema.dropTable("outbound_emails").execute();
  await database.schema.dropTable("settings").execute();
}
