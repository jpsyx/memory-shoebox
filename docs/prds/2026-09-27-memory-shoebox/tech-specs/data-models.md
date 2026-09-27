# Data model

The database behind the eighteen surfaces in [`design-spec.md`](../design-spec.md). Derived from
the mockups in [`prototypes/`](../../../../prototypes) rather than from first
principles, because a schema designed before the screens is usually missing
the one field the screen needed.

This document is what the migrations implement, and it is detailed enough that
the API contract was written against it without reopening these decisions.

**Built**, by the plan in [`../plan/step-1.md`](../plan/step-1.md). The tables
arrived in seven migrations under `apps/server/src/db/migrations/`, grouped as
the sections below are. `apps/server/src/db/types.ts` mirrors them for
Kysely, and `schemaManifest.ts` plus `apps/server/test/schema.test.ts` are
what stop this document and the database drifting apart: every column's
nullability is asserted against what SQLite actually enforces, not against
what a migration appears to say. See [`docs/server.md`](../../../server.md#database)
for how the pieces fit together; this document stays the place for what a
column means.

## How to read this

Six passes were made over the surfaces, one per group, and their findings were
merged here. Where they disagreed the disagreement is recorded with the
argument that settled it, because those are the decisions most likely to be
revisited by somebody who does not know why they went the way they did.

The open questions at the foot are answered.
[Still genuinely undecided](#still-genuinely-undecided) records that nothing is
left, and where each answer went.

---

## Every table

**Thirty-three**, and the count is worth stating because it cannot be got from
the headings. **Four are defined in prose rather than under a heading of their
own** and are marked below; a reader working from the table of contents misses
all four, which has happened.

| Section                                           | Tables                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Identity and access](#identity-and-access)       | `members`, `sign_in_codes`, `sessions`, `invitations`, `groups`, `group_members`                                                                 |
| [Visibility tables](#visibility-tables)           | `visibility_rules` **(in prose)**, `visibility_rule_subjects` **(in prose)**                                                                     |
| [The archive](#the-archive)                       | `items`, `item_renditions`, `bursts`, `milestones`, `item_milestones`, `item_capture_date_changes`, `tags`, `item_tags`, `people`, `item_people` |
| [Comments and reactions](#comments-and-reactions) | `comments`, `item_reactions`, `comment_reactions`                                                                                                |
| [Moderation](#moderation)                         | `removal_requests`                                                                                                                               |
| [Upload](#upload)                                 | `upload_sessions`, `upload_files`, `upload_batch_edits`, `upload_batch_edit_targets`, `pending_object_deletions`                                 |
| [Operations](#operations)                         | `settings`, `outbound_emails`, `email_delivery_events` **(in prose)**, `email_suppressions` **(in prose)**                                       |
| [Usage and audit](#usage-and-audit)               | `item_views`, `activity_events`                                                                                                                  |

**Five further names in this document look like tables and are not built.**
Each is named here so that finding one later reads as a decision rather than an
omission:

| Name                                                       | Why not                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `member_active_days`                                       | Deferred, in its own section. At nine members the figures compute live from `item_views`, `comments` and the two reaction tables |
| `day_rule_counts`, `tag_rule_counts`, `person_rule_counts` | A contingency if the read path stops being fast. See § The queries that will hurt first: **do not build them yet**               |
| `mail_status`                                              | There is no such table. Everything the failing-mail banner prints is a query over `outbound_emails` and two settings keys        |

---

## Conventions

The server already runs SQLite through Kysely with `journal_mode = WAL` and
**`PRAGMA foreign_keys = ON`** (`apps/server/src/db/client.ts`). That last one
matters more than it looks: every `ON DELETE` clause below is enforced, so the
cascade choices are real behaviour rather than documentation.

| Thing          | Choice                                                              | Why                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary key    | `id TEXT PRIMARY KEY`, **UUIDv7**                                   | Time-ordered, so ids sort by creation, give index locality on insert, and work as pagination cursors without a second column.                                                                     |
| Timestamps     | `TEXT`, ISO-8601 UTC with milliseconds (`2026-09-14T06:41:00.000Z`) | Lexicographic order is chronological order, so indexes and `ORDER BY` work directly, and a self-hoster can read the file with the `sqlite3` CLI. Five of the six passes chose this independently. |
| Calendar dates | `TEXT`, `YYYY-MM-DD`                                                | Milestone spans and capture days. Compares correctly as text.                                                                                                                                     |
| Booleans       | `INTEGER NOT NULL CHECK (x IN (0,1))`                               | SQLite has no boolean.                                                                                                                                                                            |
| Enums          | `TEXT` with `CHECK (x IN (...))`                                    | Readable in the shell, no lookup table, and the constraint is the documentation.                                                                                                                  |
| Bytes          | `INTEGER`                                                           |                                                                                                                                                                                                   |
| Emails         | Normalised (trimmed, lowercased) on write                           | SQLite's `COLLATE NOCASE` is ASCII-only and would mishandle a non-ASCII address.                                                                                                                  |

### Scale

Two numbers that pull in opposite directions, and nearly every performance
decision below follows from the gap between them:

- **Tens of members.** Nine in the demonstration fixtures. This will not grow.
- **Tens of thousands of items, growing for years.** 2,147 in the fixtures;
  a childhood is 50,000.

So a nine-row scan is free and a 50,000-row scan is the thing to design
around. The tables that grow with the family are trivial; the ones that grow
with the archive are `items`, `item_tags`, `item_people` and `item_views`.

### Every child column whose parent can be deleted carries an index

Before SQLite can cascade, null or refuse a delete it has to **find** the
referencing rows, and with no index on the child column it finds them by
scanning. `RESTRICT` is no exception: it still has to look before it refuses.
The scan is invisible in every test and on every small database, and it grows
with the archive, which is the gap § Scale describes.

So a child column pointing at a deletable parent is indexed even where no read
wants one. These are marked **child-delete index** in the sections below, and
each one is partial wherever the null rows are exactly the rows it would never
have anything to find in: a request whose photograph is gone, a file that
never became an item, a log row whose device has expired.

### One rule that outranks the others

**No count that visibility can filter may ever be stored.**

The spec is explicit: a hidden item "does not appear, and it is not counted",
so a day of 212 reads as 204 to somebody restricted from eight. Every count in
the product is therefore per viewer: a day's total, a tag's total, a person's
total, a milestone's total, a burst's frame count.

Every one of them appears in the fixtures as a plain number
(`Tag.itemCount`, `Person.itemCount`, `Milestone.itemCount`,
`ArchiveDay.itemCount`) and every one of them will look like an obvious
denormalisation to somebody reading a slow query. **They are all view-model
fields, and none of them may become a column.** This is the single most likely
place a hidden photograph leaks, and the change that causes it will look
entirely reasonable in a diff.

---

## Visibility, which everything else is shaped around

Read this before the tables. It is the one decision that changes the others.

### The rule is hoisted out of the item

The spec sketches `visibility(item, mode)` with `visibility_subject(visibility,
member?, group?)`: one rule per item. That is the obvious shape and it is the
wrong one, for a reason that only shows up at the scale this product reaches.

**Visibility rules are massively shared.** One upload is one decision, and in
the fixtures that decision covers 264 files. Across a whole archive the number
of distinct `(mode, sorted subject set)` tuples is tens, never one per item.

So the rule becomes its own row and items point at it:

```
items.visibility_rule_id -> visibility_rules(id, mode, subject_digest)
                            visibility_rule_subjects(rule_id, member_id | group_id)
```

The read path, once per request:

1. Expand the viewer's groups: `SELECT group_id FROM group_members WHERE member_id = :me`. Tens of rows.
2. Expand to the set of rule ids they may see. One query, tens of rows out.
3. **Every archive query then carries `AND i.visibility_rule_id IN (:visible_rules)`.**

That third line is the whole payoff. It is a plain indexed set membership over
a handful of values, so:

- **A count and the page it heads use the identical predicate**, and therefore
  cannot disagree. With per-item subjects, every count is a correlated
  `EXISTS` evaluated once per item, and the count and the page are two
  different queries that have to be kept in step by hand.
- An admin drops the predicate entirely, which is both correct and fastest.
- Group membership stays retroactive, because steps 1 and 2 run at read time.
  Nothing is ever snapshotted.

### What that costs

- **Rules are immutable from the product's edit path.** Changing one item's
  visibility points it at a different rule, creating one if no rule with that
  digest exists yet. It never edits a rule in place, because the rule is
  shared and editing it would change the other 263 photographs.
- **Rules need sweeping** when no item references them.
- `subject_digest` is a canonical hash of the sorted subject list, used to find
  an existing rule before inserting one. Its index is **not** unique: deleting
  a member can make two previously distinct rules collide, and tolerating an
  equivalent duplicate is cheaper than merging them mid-transaction.
- Seed one row at migration time with `mode = 'everyone'` and a constant id, so
  the default costs no lookup.

### What it buys, beyond the counts

An upload session carries one `visibility_rule_id` instead of its own subject
table, and ingest copies the id onto each item. That is one column instead of
a whole table, and it is exact rather than a re-application of a rule that
might have been edited in between.

### The evaluation

An item is visible to a member when **any** of these holds:

1. the member is an admin (absolute, and cannot be restricted by anyone);
2. **they uploaded it** (`items.uploaded_by = :me`);
3. the rule's mode is `everyone`;
4. the mode is `only` and the member is among the expanded subjects;
5. the mode is `except` and they are not.

Clause 2 makes the timeline predicate
`visibility_rule_id IN (:visible) OR uploaded_by = :me`. It cannot leak,
because it only ever adds items the viewer put there themselves, and it is the
only version that survives a group membership change months later: a rule that
was correct in September becomes self-excluding when an admin adds its author
to Cousins in October, and no write-time check can catch that. Decision 7.

Two consequences worth stating because they are easy to get wrong:

- **A permalink the viewer may not open returns 404, never 403.** A 403
  confirms that something exists at that id, which is exactly what the
  counting rule exists to prevent.
- **A people tag is never consulted, and clause 2 must not be extended to
  cover one.** Being in a photograph is not a key to it; only having uploaded
  it is. `item_people` must not appear anywhere in a visibility expression. Nothing in the schema can enforce that, so it
  wants a comment in the migration and a test named for it: a photograph
  restricted to admins, people-tagged for a viewer, must be invisible to that
  viewer and absent from their day count.

### Deleting a group is a security boundary

`visibility_rule_subjects.group_id` is **`ON DELETE RESTRICT`**, and this is
the one cascade choice worth arguing about.

Cascading looks harmless and is not. Taking a group out of an `only` rule
narrows access, which is safe. Taking it out of an **`except`** rule _widens_
it: a rule that hid fifty photographs from the cousins becomes a rule that
hides them from nobody, and every one of those photographs is silently
revealed. A cascade would do that quietly, in a trigger nobody is reading, at
the moment an admin pressed a button labelled "delete a group".

So the database refuses, and the Groups surface does the rewrite deliberately
inside a transaction, having told the admin what happens in both directions.
That surface's confirmation was corrected to say so.

One consequence to handle explicitly: an `only` rule whose last subject is
removed becomes an empty allow list. That **fails closed** (admins only),
which is the safe direction, but an admin should be told rather than finding
out later.

---

## Identity and access

### `members`

The account. One row per invited address, for the life of the Shoebox.

**A member row is never hard-deleted.** Removal is a status change. The Members
surface says so outright ("Nothing they uploaded or wrote is deleted, and their
name stays on it"), and because every authorship key in the product hangs off
this id, making removal a status means those keys can be `RESTRICT` and the
restriction never actually fires.

| Column              | Type    | Null | Default     | Note                                                                                                                                                                             |
| ------------------- | ------- | ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | TEXT    | no   |             | uuid                                                                                                                                                                             |
| `email`             | TEXT    | no   |             | Normalised. This _is_ the identity: My account states it can never be changed, so there is no change flow and no verification column.                                            |
| `display_name`      | TEXT    | yes  |             | Set by the admin on the invite form, pre-filled from a matching `people` row; correctable by the member in My account. Falls back to the email local part when null. Decision 1. |
| `role`              | TEXT    | no   | `'viewer'`  | `CHECK IN ('viewer','uploader','admin')`. A strict ladder, compared in app code.                                                                                                 |
| `status`            | TEXT    | no   | `'invited'` | `CHECK IN ('invited','active','removed')`                                                                                                                                        |
| `notify_on_upload`  | INTEGER | no   | `1`         | Somebody puts photographs up.                                                                                                                                                    |
| `notify_on_comment` | INTEGER | no   | `1`         | Somebody comments on something of theirs.                                                                                                                                        |
| `notify_on_reply`   | INTEGER | no   | `1`         | Somebody comments on something they commented on.                                                                                                                                |
| `notify_on_removal` | INTEGER | no   | `1`         | Somebody asks for a photograph of them to come down. Admins and uploaders only; a viewer never receives one.                                                                     |
| `joined_at`         | TEXT    | yes  |             | First successful sign-in.                                                                                                                                                        |
| `last_signed_in_at` | TEXT    | yes  |             | Written when a code is redeemed. Distinct from `last_seen_at`.                                                                                                                   |
| `last_seen_at`      | TEXT    | yes  |             | Last authenticated request. The Members table's "Last seen".                                                                                                                     |
| `removed_at`        | TEXT    | yes  |             |                                                                                                                                                                                  |
| `created_at`        | TEXT    | no   |             |                                                                                                                                                                                  |

**Unique**: `(email)`, global. A removed member keeps their address claimed, and
re-inviting it reuses the row rather than inserting a second. That reuse is
what makes "inviting them back later picks up where this left off" true.

**Four notification columns, not four settings rows.** The recipient query
filters on them directly (`WHERE notify_on_upload = 1`), so they want to be a
predicate rather than a join and a JSON decode. "Turn them all off" on My
account writes all four; it is a convenience action, not a fifth column.

**Sign-in codes ignore all four and cannot be turned off**, because without
them there is no way back in. A member who has suppressed everything else
still receives them. Decision 16.

`last_signed_in_at` and `last_seen_at` are two different facts and both are
wanted. Under a 30-day sliding session they can differ by a month: a phone
used daily never re-authenticates.

### `sign_in_codes`

**The code is stored as `HMAC-SHA256(digits, server_pepper)`, not plaintext and
not a bare digest.** Six digits is a 10^6 space, so a leaked table of plain
SHA-256 hashes is reversed instantly with a rainbow table of a million
entries. The pepper lives in the app config, so a read-only database leak (a
copied volume, a stray backup) yields nothing during the ten-minute window. A
slow KDF is overkill given the expiry and the attempt cap; the pepper is the
part that matters.

**A row is written even for an address that is not a member.** The spec
requires an unknown address to be indistinguishable from a known one, and that
has to hold through the wrong-code and resend states too, not just the first
screen. Writing the row regardless keeps one code path, one timing profile and
one place to rate-limit. Nothing is sent when `member_id` is null.

| Column           | Type    | Null | Default | Note                                                                                                                          |
| ---------------- | ------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`             | TEXT    | no   |         | uuid                                                                                                                          |
| `email`          | TEXT    | no   |         | Normalised. **Not** a foreign key: unknown addresses get rows.                                                                |
| `member_id`      | TEXT    | yes  |         | Null means nothing was mailed. FK `members(id)` CASCADE: a live code outliving its member is an authentication bypass.        |
| `code_hash`      | TEXT    | no   |         | Compared with a constant-time compare.                                                                                        |
| `attempts`       | INTEGER | no   | `0`     | "Two tries left" is `max_attempts - attempts`.                                                                                |
| `max_attempts`   | INTEGER | no   | `3`     | Stored, so the remaining-tries message is computable from the row and a config change does not retroactively burn live codes. |
| `expires_at`     | TEXT    | no   |         | Ten minutes, stated in the UI and the email.                                                                                  |
| `consumed_at`    | TEXT    | yes  |         | Single use is this being null.                                                                                                |
| `invalidated_at` | TEXT    | yes  |         | Superseded by a resend, or attempts exhausted. "The old one has stopped working" is a state, not a side effect of expiry.     |
| `created_at`     | TEXT    | no   |         | Also the rate-limit clock.                                                                                                    |

**Index**: `(email, created_at DESC)` serves both queries. Sweep rows older
than 24 hours; this is the fastest-growing table in the product and holds
nothing of value after expiry.

Submitting a code must be **one transaction**, or two concurrent submissions
each get three attempts.

### `sessions`

What My account calls "devices". Named for its lifetime: the row appears at
sign-in, vanishes on sign-out, and falls out at 30 days idle. There is no
durable device record underneath it in any mockup.

**Sessions are looked up in the database on every request.** Both surfaces
promise a signed-out device "stops working immediately, wherever it is". That
rules out a stateless JWT and any cache without an invalidation channel. This
is an architecture constraint an auth library will quietly violate.

| Column         | Type | Null | Default | Note                                                                                                                 |
| -------------- | ---- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`           | TEXT | no   |         | uuid. Also what the UI compares to mark "this one".                                                                  |
| `member_id`    | TEXT | no   |         | FK `members(id)` CASCADE. Never fires; exists so shell surgery cannot leave a live credential belonging to nobody.   |
| `token_hash`   | TEXT | no   |         | SHA-256 of a 256-bit random cookie value. A fast hash is correct: unlike the six digits, the token has real entropy. |
| `device_label` | TEXT | no   |         | "iPhone, Safari". Derived once at creation, stored so an upgraded parser does not relabel existing devices.          |
| `user_agent`   | TEXT | yes  |         | The raw string, as the fallback when the parsed label is wrong or empty.                                             |
| `created_at`   | TEXT | no   |         |                                                                                                                      |
| `last_used_at` | TEXT | no   |         | Slides on use.                                                                                                       |
| `expires_at`   | TEXT | no   |         | `last_used_at + 30 days`. Both "Stays until" and "Falls out in N days" read off this.                                |

**No IP address column and no location at all.** A device row reads
"iPhone, Safari, in use now, 30 days left", and the label plus the date carries
the recognition on its own. City-level lookup would mean a 70MB GeoIP database
and a key, which is a fourth infrastructure dependency in all but name, to
separate devices that in a nine-person family are mostly in the same two
cities. Decision 6.

**Indexes**: `UNIQUE (token_hash)` is the hot path, hit on every authenticated
request including every thumbnail. Plus `(member_id, last_used_at DESC)` and
`(expires_at)`.

**The one hot write.** Sliding naively means a write per request, and a
timeline page pulls dozens of thumbnails; under WAL those still serialise on
the single writer. **Only slide when the remaining lifetime has moved by more
than a day.** That caps it at roughly one write per session per day and no
member can tell the difference. Throttle `members.last_seen_at` the same way.

### `invitations`

The `members` row is created up front with `status = 'invited'`, because the
fixtures need a stable member id before first sign-in: a pending invitee
already carries a role, appears in the members table, sits in a group, and is
the target of a person link.

**No token or code column.** The invitation email carries no credential: it
names the address, points at a join page, and says a six-digit code will be
emailed when you get there. Acceptance is simply the first successful sign-in
at the invited address. That keeps the product's strongest claim intact and
means a forwarded invitation grants nothing. The join link carries the address
as a plain query parameter so the field arrives pre-filled, which is an
address, not a credential. Decision 2.

There is also no `consumed_at` and no attempt cap, because there is nothing to
consume or to guess. `sign_in_codes` already carries both for the code itself.

**Because there is no credential, the `members` row is the only thing granting
access, and `invitations` must never be the only thing that closes it.** This
is the one place where dropping the token has a consequence that is easy to
miss, and it goes both ways:

- **Revoking** an invitation runs the whole member-removal transaction, not
  just `revoked_at`. Setting `revoked_at` alone leaves a row with
  `status = 'invited'` that is still mailed a sign-in code and can still sign
  in, so an admin who pressed "revoke" would be wrong about what they did.
- **Expiry** is the same hole, silently: nobody presses anything, the seven
  days lapse, and the row stays signable forever. An hourly
  `invitation-lapse` job flips any `invited` member whose latest invitation is
  past `expires_at` and unrevoked to `status = 'removed'`. The expiry date the
  email states is then true.

Both keep one invariant worth stating plainly, because the sign-in path depends
on it and should not have to check anything else: **`status` alone decides
whether an address may sign in.** A lapsed invitee reads as removed, which is
what they are, and re-inviting them reuses the row exactly as re-inviting
anybody else does.

| Column                 | Type    | Null | Default | Note                                                                                       |
| ---------------------- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------ |
| `id`                   | TEXT    | no   |         | uuid                                                                                       |
| `member_id`            | TEXT    | no   |         | FK `members(id)` CASCADE. Not unique: re-inviting a removed member adds a second row.      |
| `invited_by_member_id` | TEXT    | no   |         | FK `members(id)` **RESTRICT**. The attribution is shown in an email that survives forever. |
| `created_at`           | TEXT    | no   |         |                                                                                            |
| `expires_at`           | TEXT    | no   |         | Seven days, stated in the email and the banner.                                            |
| `send_count`           | INTEGER | no   | `1`     | "Send it again" increments. Part of the email idempotency key.                             |
| `last_sent_at`         | TEXT    | no   |         | Resend throttling.                                                                         |
| `revoked_at`           | TEXT    | yes  |         |                                                                                            |
| `accepted_at`          | TEXT    | yes  |         | Mirrors `members.joined_at`.                                                               |

No `role` column: `members.role` is the single source of truth and an admin may
change the offered role before acceptance. Two copies would disagree.

### `groups` and `group_members`

`groups`: `id`, `name`, `name_normalized`, `created_at`.
`UNIQUE (name_normalized)`, with the same normalisation as `tags`: trimmed,
lowercased, whitespace-collapsed, NFC. Nothing demands it, but two groups
called "Cousins" makes the visibility picker unusable and there is no way to
tell them apart in a chip. The column is named here rather than left as "the
normalised form" because two slices would otherwise invent two names for it.

`group_members`: `id`, `group_id` (CASCADE), `member_id` (CASCADE),
`created_at`. `UNIQUE (group_id, member_id)`.

**`INDEX (member_id, group_id)` is the second-hottest index in the product.**
Visibility expansion reads it on every timeline query and every count, and the
unique index above cannot serve it because `member_id` is not its leading
column. It is easy to miss, because the surface that needs it is not the
surface that owns the table.

Removing a member deletes their group memberships, inside the same transaction
as the status change.

### The last admin

`SELECT count(*) FROM members WHERE role = 'admin' AND status = 'active'` run
outside a transaction lets two concurrent demotions each see two admins and
leave the Shoebox with zero, which is unrecoverable without shell access. The
role change runs inside `BEGIN IMMEDIATE`, recounts after the update, and rolls
back on zero. SQLite cannot express this as a constraint.

Two gaps in the mockup's version: it guards demotion but not **removal**, which
has the identical consequence, and it does not say whether an invited admin
counts. It should not: an invited admin cannot act, so counting them lets the
real admin lock the Shoebox waiting on somebody who may never accept.

---

## The archive

### `items`

The atom: one photograph or one video.

| Column                       | Type    | Null | Default | Note                                                                                                                                                                                                                                      |
| ---------------------------- | ------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | TEXT    | no   |         | uuid. Also the permalink.                                                                                                                                                                                                                 |
| `kind`                       | TEXT    | no   |         | `CHECK IN ('photo','video')`                                                                                                                                                                                                              |
| `captured_at`                | TEXT    | no   |         | The instant the shutter fired, UTC.                                                                                                                                                                                                       |
| `captured_at_offset_minutes` | INTEGER | yes  |         | The UTC offset the file carried. Null means it carried none and the day below is a guess.                                                                                                                                                 |
| `captured_on`                | TEXT    | no   |         | **Local** `YYYY-MM-DD`, derived at write. The timeline's grouping key, and stored rather than computed because `date(captured_at)` in UTC puts a 23:30 local photograph on the wrong day and therefore under the wrong milestone.         |
| `capture_source`             | TEXT    | no   |         | `CHECK IN ('exif','video_metadata','filename','file_mtime','uploader_set','upload_time')`. Which day a photograph lands on is user-visible, so how it was decided has to be recoverable.                                                  |
| `original_captured_at`       | TEXT    | no   |         | Frozen at ingest, never written again. Gives "revert to what the file said" without a lookup.                                                                                                                                             |
| `seq`                        | INTEGER | no   |         | Monotonic arrival order, assigned in the insert transaction. **Not `rowid`**: `VACUUM` can renumber rowids on a table whose primary key is not `INTEGER`.                                                                                 |
| `uploaded_by`                | TEXT    | no   |         | FK `members(id)` RESTRICT. Deletion rights and notification routing both read it.                                                                                                                                                         |
| `upload_session_id`          | TEXT    | yes  |         | FK `upload_sessions(id)` SET NULL. Burst detection scope. The `SET NULL` cannot fire: nothing deletes a session row, and `DELETE /api/upload-sessions/:sessionId` returns `409` on a committed batch to keep it that way. See § `bursts`. |
| `visibility_rule_id`         | TEXT    | no   |         | FK `visibility_rules(id)` RESTRICT. An item with no rule has undefined visibility, which fails open.                                                                                                                                      |
| `burst_id`                   | TEXT    | yes  |         | FK `bursts(id)` SET NULL. Dissolving a burst leaves forty-five prints standing.                                                                                                                                                           |
| `burst_index`                | INTEGER | yes  |         | 1-based. Orders the sibling strip without a second sort key.                                                                                                                                                                              |
| `width`                      | INTEGER | no   |         | **Display** width, after EXIF orientation is applied.                                                                                                                                                                                     |
| `height`                     | INTEGER | no   |         | Display height.                                                                                                                                                                                                                           |
| `duration_ms`                | INTEGER | yes  |         | Videos. Must be stored: the transport positions pinned-comment marks as `at_seconds / duration`, so without it every mark lands wrong on first paint and then jumps.                                                                      |
| `byte_size`                  | INTEGER | no   |         | Sums to the Shoebox settings storage figure.                                                                                                                                                                                              |
| `content_type`               | TEXT    | no   |         |                                                                                                                                                                                                                                           |
| `checksum`                   | TEXT    | yes  |         | Within-upload dedupe.                                                                                                                                                                                                                     |
| `original_filename`          | TEXT    | yes  |         |                                                                                                                                                                                                                                           |
| `alt_text`                   | TEXT    | yes  |         | An **override**, written only when somebody types a real description. Null is the normal case: the served alt text is composed at render from the people tags and the capture date. Decision 9.                                           |
| `created_at`                 | TEXT    | no   |         |                                                                                                                                                                                                                                           |

**No `deleted_at`.** The spec forbids a hidden flag in three separate places.
Do not let a soft delete in.

**`width` and `height` are post-orientation.** Storing raw EXIF dimensions on a
portrait phone photograph with an orientation flag gives the pile a landscape
box with a rotated image inside it. This is the most likely silent layout bug
in the product, and the pile crops nothing, so the proportions are load-bearing
rather than cosmetic.

**Indexes**

| Index                                           | For                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNIQUE (seq)`                                  | Ordering and unseen comparisons                                                                                                                                       |
| `(captured_on DESC, visibility_rule_id, id)`    | The timeline. Covering: the group-by runs in index order, the visibility filter is checked inside the index, and a `LIMIT 30` stops early without touching the table. |
| `(visibility_rule_id, captured_on)`             | The mirror, which wins when the visible rule set is very selective. Keep both, run `ANALYZE`, let the planner choose.                                                 |
| `(burst_id, burst_index)`                       | Fanning a burst                                                                                                                                                       |
| `(upload_session_id, captured_on, captured_at)` | Burst detection and the upload day grouping                                                                                                                           |
| `(uploaded_by)`                                 | "My uploads"                                                                                                                                                          |

**Days are derived.** No `days` table: a day is `GROUP BY captured_on`, and its
count is per viewer. The one cost is that **a day with no items still has to
appear when a milestone spans it**, so the day stream is the union of the
distinct `captured_on` of visible items and every date inside every overlapping
milestone span. Do not materialise that; milestones are tens of rows, so fetch
the overlapping ones and expand their spans in the application, exactly as
`data/milestones.ts` already does.

**Paginate on the date, not an offset.** `WHERE captured_on <= :cursor`. An
offset breaks the moment a new item lands, and a synthetic milestone-only day
still has a date to be a cursor.

### `item_renditions`

A video has five or six storage keys (original, webm, mp4, poster, thumb).
Those are a child table, not six widening nullable columns.

`id`, `item_id` (CASCADE), `purpose` (`CHECK IN ('original','display','thumb','poster','video_webm','video_mp4')`),
`storage_key`, `content_type`, `byte_size`, `width`, `height`.

`UNIQUE (item_id, purpose)` and `UNIQUE (storage_key)`, so a double upload
cannot point two rows at one object and make deletion ambiguous.

**These are keys, not URLs.** A URL is a short-lived signed thing minted at
render. The pile fetches them one batched query per page, keyed by the page's
item ids, not one join per print.

### `bursts`

`id`, `upload_session_id` (RESTRICT), `captured_on`, `starts_at`, `ends_at`,
`detector_version`, `threshold_seconds`, `detected_at`, `is_manual`,
`cover_item_id` (SET NULL, and only when a person picked one).

**`detector_version` and `threshold_seconds` are nullable, and `is_manual` is
why.** A burst somebody grouped by hand was produced by no detector, so it has
no parameters to record. An automatic burst always carries both. If manual
bursts should instead copy whatever the configuration held at the time, these
become `NOT NULL` and the grouping code fills them; settled as nullable while
building migration 0003, because the alternative records a threshold that did
not produce anything.

**`upload_session_id` is `RESTRICT` here, and that is right, because an
`upload_sessions` row is never deleted.** This was recorded as an unresolved
contradiction with `items.upload_session_id`, which is `SET NULL`. It is not
one, and the resolution is the other way round from what that note guessed.

Nothing in the product deletes a session row. `DELETE /api/upload-sessions/:sessionId`
is named for the Cancel button and sets `state = 'cancelled'`: in the upload
slice's own words, "the rows stay: they are the record that the attempt
happened". That route further returns `409` on a committed session **precisely
because** deleting it "would `SET NULL` on `items.upload_session_id` and orphan
them while the email never fires". `upload-abandon-sweep` cancels rather than
deletes. There is no purge route, no purge job, and no requirement for one.

The rows are worth keeping for a reason that outlives the items:
`upload_files.problem_code` and `problem_detail` are the only record of a file
that failed or was refused and therefore never became an item. A session purge
would take that history with it, and save nothing worth having: sessions are
one row per batch, a few hundred across a decade, while `upload_files` is the
table that grows.

So `RESTRICT` here agrees with how the product behaves, and
**`items.upload_session_id` is the anomaly**: its `SET NULL` cannot fire,
because nothing performs the deletion that would trigger it, and the rationale
once written beside it described an operation the upload slice exists to
refuse. Both columns are left as built. Neither is worth a table rebuild, and
the one that is theoretically wrong is also unreachable.

**Two things migration 0003 decided that this document does not state**, both
recorded so the purging decision above is made with them in view rather than
discovered afterwards. `upload_session_id` is **`NOT NULL`**, on the reasoning
that an automatic burst is meaningless without its detection scope. Note what
that costs: moving to `SET NULL` later means rebuilding the table under
SQLite's twelve-step alter procedure, not just changing a foreign key, and it
sits awkwardly beside a manual burst, which has no detector and could in
principle be grouped by hand across two sessions. And `is_manual` carries
`DEFAULT 0`, which matches how `members.notify_*` is written in migration 0001
but is a value this document never names.

`threshold_seconds` and `detector_version` are on the row because the detector
is configuration rather than a constant: `burst.maxGapSeconds` and
`burst.minimumFrameCount` live in [`app.config.ts`](../../../../app.config.ts)
and an operator may change either. Recording the parameter that produced a
burst lets a new value, or a better algorithm, re-derive the automatic ones
without touching anybody's manual grouping.

**A run of two frames is not a burst.** `burst.minimumFrameCount` is 3, so two
photographs six seconds apart stay two plain prints and no `bursts` row is
written. This is the same rule as the one three paragraphs down, where a burst
with a single visible frame renders as a plain print: a stack of one or two
costs the viewer a fan-open and saves the day no room.

**No `frame_count`, and this is not an oversight.** The viewer prints "Frame 7
of 45" and the stack prints "45 frames, 06:41 to 06:44". Visibility is per
item, so a burst can be partially visible, and a stored count is the
unfiltered count. It would leak restricted frames through a denominator in
exactly the way the spec forbids for a day total. Both the count and the span
come from the visibility-filtered sibling query.

Three rendering rules follow: the cover resolves at read time to
`cover_item_id` if visible and otherwise the earliest visible frame; **one**
visible frame renders as a plain print, not a stack of one; **zero** visible
frames and the burst vanishes and contributes nothing to the day.

Deleting the last frame of a burst must drop the burst row. No foreign key
direction does that, so it is a step in the delete transaction.

**Indexes**: `(cover_item_id)` and `(upload_session_id)`, both child-delete
indexes (§ Conventions) and both on a table that grows with the archive.
Without the first, every item delete scans every burst to fire the `SET NULL`;
without the second, the session purge that `RESTRICT` exists to order scans
every burst before it is allowed to proceed. `upload_session_id` is `NOT NULL`,
so that one is plain rather than partial.

### `milestones`

| Column                     | Type | Null | Note                                                                                    |
| -------------------------- | ---- | ---- | --------------------------------------------------------------------------------------- |
| `id`                       | TEXT | no   | uuid                                                                                    |
| `name`                     | TEXT | no   |                                                                                         |
| `starts_on`                | TEXT | no   | `YYYY-MM-DD`, inclusive                                                                 |
| `ends_on`                  | TEXT | no   | Inclusive. **Equal to `starts_on` for a one-day occasion**, never null.                 |
| `blurb`                    | TEXT | yes  | The line under the name in the band                                                     |
| `created_by`               | TEXT | yes  | FK `members(id)` SET NULL: a milestone is a family fact that outlives whoever typed it. |
| `created_at`, `updated_at` | TEXT | no   |                                                                                         |

**A milestone has no visibility of its own**, and there is deliberately no
`visibility_rule_id` here. The occasion and its name are visible to everybody;
only its photographs are restricted. The create form says so, in as many words,
so nobody types something into a name they would not say out loud.

The rejected alternative (hide a milestone whose every visible item count is
zero) has a bad property: attaching one restricted photograph to a previously
empty occasion would make that occasion vanish from everybody else's timeline.
It also breaks the empty-milestone state, which is a designed surface.
Decision 5.

`ends_on` not-null-and-equal-for-one-day _is_ the span model.
`data/milestones.ts` is written against exactly that one shape
(`isMultiDayMilestone` is literally `startsOn !== endsOn`), and a nullable
`ends_on` would force every helper and every caller to branch.

`CHECK (ends_on >= starts_on)`, enforced in the database: the day-count helper
returns a negative otherwise and the day-list helper builds an array of
negative length. Plus a `GLOB` check on the date shape, since SQLite has no
date type and an ISO datetime sneaking in would break string comparison.

`INDEX (starts_on, ends_on)` for the overlap predicate. No unique on `name`:
two "Mateo's birthday" milestones a year apart are both correct.

### `item_milestones`

`id`, `item_id` (CASCADE), `milestone_id` (CASCADE), `attached_by` (SET NULL),
`attached_at`, `span_mismatch_acknowledged_at`.

`UNIQUE (item_id, milestone_id)`, indexed in both directions.

**The CASCADE on `milestone_id` is the delete dialog's promise**: "The occasion
goes from the timeline. The 212 photographs stay exactly where they are.
Nothing is deleted except the label." It removes join rows only. A cascade in
the other direction would be the most damaging bug the product could ship.

**An item may be attached to a milestone whose span does not contain it.** This
is allowed, and it forces two things apart that look like one:

- **A milestone's item set is the join table**, never a date range.
- **A milestone's day set is the date range**, never the join table. A day
  inside a span with no items still shows the occasion.

`span_mismatch_acknowledged_at` exists because the reconciliation flow offers
"Leave them as they are" as a real choice. Without it, every visit re-offers
the same fix for the same four photographs and a considered decision becomes a
nag.

Many-to-many, deliberately: a photograph from 17 September belongs to both
"Home from the hospital" (one day) and "Mateo's first week at home" (five
days), and both are in the fixtures. `milestonesForDay` already returns a list.

**One full band per day.** Where two milestones cover the same day, the
narrowest span wins the band and every other one is a continuation strip
beneath it; ties break by earliest start. So 17 September opens with "Home from
the hospital" and carries "Mateo's first week at home, day 1 of 5" under it.
The narrower span is the more specific thing to say about that day, the day
keeps one headline, and a longer occasion still opens as a full band on the
first of its days where nothing narrower competes. Decision 14.

### `item_capture_date_changes`

The audit trail for the one destructive metadata edit in the product.

`id`, `item_id` (CASCADE), `milestone_id` (SET NULL), `previous_captured_at`,
`previous_capture_date`, `previous_capture_source`, `new_captured_at`,
`new_capture_date`, `changed_by` (RESTRICT), `changed_at`, `reason`
(`milestone_reconcile` | `manual` | `timezone_change`).

`reason = 'timezone_change'` is the Shoebox timezone being changed, which
rewrites `captured_on` for every item that carried no offset of its own. It
writes **one row per moved item**, not one row for the change: this table is
what makes "revert that" mean something, and a single row saying 34 items moved
cannot be reverted per item. Thirty-four rows, written once, read on no hot
path, is exactly what the table was sized for.

`reason = 'manual'` is the hand correction offered on the item viewer to an
item's uploader and to any admin. Two consequences follow from rules settled
elsewhere, and both are steps in the same transaction:

- Moving an item off its burst's day **ejects it from the burst**
  (`burst_id = NULL`), because a burst is a same-day run by definition. If that
  empties the burst, the burst row goes too.
- Moving it outside an attached milestone's span raises the **existing**
  mismatch flow rather than a new one, and clears
  `item_milestones.span_mismatch_acknowledged_at` so the reconciliation is
  offered again.

`items.original_captured_at` is never written by either path, so "revert to
what the file said" stays one step away however many times a date is moved.
Decision 10.

Worth a table because moving a capture date is the only edit that destroys a
fact the file carried, the server does not re-read EXIF out of B2, and it is a
bulk action, so "undo that" has to mean something. It costs one row per moved
item, written once, read on no hot path.

Two details the fix flow forces: **preserve the clock time and change only the
date**, so a 06:41 photograph becomes 06:41 on the new day and no fact is
invented; and a multi-day occasion asks **per item** which of its days, because
guessing would quietly invent one.

Widening the occasion instead is one `UPDATE milestones` with no fan-out, and
is not audited: the two dates are user-authored facts the edit form already
lets anybody change freely.

**Indexes**: `(item_id, changed_at DESC)`, which is how the item viewer reads
one item's history newest first to offer "revert that", and is also the
child-delete index for the `items` CASCADE (§ Conventions); and
`(milestone_id) WHERE milestone_id IS NOT NULL`, the child-delete index for the
`milestones` `SET NULL`, which `DELETE /api/milestones/:milestoneId` fires
against this table to keep its promise that nothing blocks it. The first leads
with `item_id` and so cannot serve the second at all. Partial because only a
`milestone_reconcile` row carries a milestone: every manual and
timezone-change row leaves the column null.

### `tags`, `item_tags`, `people`, `item_people`

`tags`: `id`, `name` (display form as typed, spaces intact), `name_normalized`
(trimmed, lowercased, whitespace-collapsed, NFC) with `UNIQUE`, `created_by`
(SET NULL), `created_at`. The field is free text and "Hospital" must not become
a second tag.

`item_tags`: `id`, `item_id` (CASCADE), `tag_id` (CASCADE), `tagged_by`
(SET NULL), `tagged_at`. `UNIQUE (item_id, tag_id)`, indexed **both ways**, so
a multi-filter query can drive from whichever predicate is most selective.

`people`: `id`, `display_name`, `member_id` (nullable, **partial UNIQUE where
not null**, FK `members(id)` SET NULL), `preferred_face_item_id` (SET NULL),
`created_by` (SET NULL), `created_at`.

**The link goes on `people`, not on `members`**, for three reasons: the person
record long predates the member record and may never get one; linking later is
a single `UPDATE people SET member_id = ?` that moves no tagging history; and
the unique constraint is what stops two person records claiming one account.

`item_people`: `id`, `item_id` (CASCADE), `person_id` (**RESTRICT**),
`tagged_by` (SET NULL), `tagged_at`. `UNIQUE (item_id, person_id)`, indexed both
ways.

RESTRICT on `person_id` differs from `item_tags` on purpose. Deleting a person
would silently strip them from hundreds of photographs with no undo, and the
removal-request flow depends on knowing who is in a picture. Force an explicit
untag first.

**The directory's face is a visibility hazard.** It must come from an item the
viewer can see, resolved at read time: the preferred face if visible, otherwise
the most recent visible item tagged with that person, otherwise the ghost frame
the surface already has. And **the directory response must not carry
`member_id`**: members and non-members are shown alike because holding an
account is a permission fact, and this is a family.

---

## Visibility tables

`visibility_rules`: `id`, `mode` (`CHECK IN ('everyone','only','except')`),
`subject_digest` (canonical hash of the sorted subject list, `''` for
`everyone`), `created_at`. Index `(mode, subject_digest)`, **not unique**.

`visibility_rule_subjects`: `id`, `rule_id` (CASCADE), `subject_type`
(`CHECK IN ('member','group')`), `member_id` (CASCADE), `group_id`
(**RESTRICT**, for the reason argued above).

`CHECK` that exactly one of the two id columns is set and that it agrees with
`subject_type`. Plus `(member_id)` and `(group_id)` for the reverse sweep.

**No subject may appear on a rule twice**, and expressing that takes two
partial unique indexes rather than one composite:

```sql
CREATE UNIQUE INDEX visibility_rule_subjects_member
    ON visibility_rule_subjects (rule_id, member_id)
 WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX visibility_rule_subjects_group
    ON visibility_rule_subjects (rule_id, group_id)
 WHERE group_id IS NOT NULL;
```

This section previously specified
`UNIQUE (rule_id, subject_type, member_id, group_id)`, which **cannot reject
anything**. Exactly one of the two id columns is null by construction, and
SQLite follows the SQL standard in treating distinct nulls as distinct inside
a unique index, so every row is unique on that tuple no matter what it holds.
Demonstrated during the build: inserting `('r1','group',NULL,'g1')` twice
under that constraint leaves two rows. The paired partial indexes reject the
second and still accept the same group on a different rule.

**The two single-column indexes for the reverse sweep are still needed**, and
are named apart to avoid colliding with the pair above:
`visibility_rule_subjects_member_sweep` on `(member_id)` and
`visibility_rule_subjects_group_sweep` on `(group_id)`. The partial indexes
cannot serve the sweep, because each leads with `rule_id` and the sweep
searches by subject without knowing a rule.

So four indexes on this table: two that enforce, two that find.

The restricted marker on a print ("Just us two") is composed from the rule's
subjects at read time. Do not store a label: the rule is shared and deduped,
and a stored label goes stale the moment a group is renamed.

---

## Comments and reactions

### `comments`

`id`, `item_id` (**CASCADE**), `author_member_id` (**RESTRICT**), `body`
(`CHECK (length(trim(body)) > 0)`), `at_seconds` (REAL, nullable), `created_at`,
`edited_at` (nullable).

**An author can edit and delete their own comment.** `edited_at` is what the
**edited** marker reads off, and it is not optional: a comment that changes
under a reader with no sign of it is worse than one that cannot change at all.
Admins keep "delete anything" from the roles table, and an admin deleting
somebody else's comment writes an `activity_events` row. Deleting a comment
takes its reactions with it (`comment_reactions` CASCADE).

One limit worth stating because it cannot be fixed: the notification email
quotes the comment as it was sent, and an edit cannot catch a message already
delivered. Decision 8.

`REAL` rather than integer for `at_seconds`: the scrubber produces
`fraction * duration`, a float. The fixtures use whole seconds only because
they were typed by hand.

**No visibility column.** Comments inherit their item's rule exactly; copying
it would be a second source of truth that can drift.

CASCADE from the item is the delete modal's own copy ("the three comments on it
go with it"). RESTRICT on the author is the opposite choice for the opposite
reason: cascading would let removing one relative silently erase a decade of
the family's conversation on photographs that stay up. It never fires, because
members are never hard-deleted.

**No `parent_comment_id`.** The thread is flat in both surfaces. The spec's
notification line "a reply on something you posted or commented on" means
another top-level comment on the same item, not threading.

Index `(item_id, created_at)` covers both the read and the ordering.

### Reactions: two tables, not one

`item_reactions`: `id`, `item_id` (CASCADE), `member_id` (CASCADE), `kind`
(`CHECK IN ('like','love','care','haha','wow','sad')`), `created_at`.
`UNIQUE (item_id, member_id)`.

`comment_reactions`: identical, with `comment_id` (CASCADE) and
`UNIQUE (comment_id, member_id)`.

The alternative was one polymorphic table with `target_type` and `target_id`.
It loses on the one thing this product is unusually strict about: **deletion is
hard and final, with no flag to fall back on.** SQLite cannot declare a foreign
key against two tables, so a polymorphic reactions table has no cascade at all
and cleanup becomes application code or a trigger. A missed path leaves a row
pointing at a dead uuid forever, and an orphaned reaction is an invisible bug
that renders nothing and alerts nobody until somebody counts rows. Two tables
buy engine-enforced cleanup for the price of one duplicated four-column table,
and the polymorphism that actually matters is in the UI, where one component
already serves both.

The unique constraint is the whole of "one per member per thing". Leaving a
second reaction is `INSERT ... ON CONFLICT DO UPDATE SET kind = excluded.kind`;
pressing your own is a `DELETE`. Both are one statement and both are point
lookups.

**Order the kinds server-side** by `(count DESC, canonical position ASC)`. The
client sorts by count with no tiebreak, so four loves and four cares would
swap places between page loads.

**Return rows, not aggregates.** The popover needs the names anyway, and at
family scale the aggregate is smaller than the list it summarises.

---

## Moderation

### `removal_requests`

| Column                    | Type | Null    | Note                                                                                      |
| ------------------------- | ---- | ------- | ----------------------------------------------------------------------------------------- |
| `id`                      | TEXT | no      | uuid                                                                                      |
| `item_id`                 | TEXT | **yes** | FK `items(id)` **SET NULL**. See below.                                                   |
| `requested_by_member_id`  | TEXT | no      | FK `members(id)` RESTRICT                                                                 |
| `reason`                  | TEXT | yes     | Optional by design                                                                        |
| `state`                   | TEXT | no      | `CHECK IN ('open','deleted','declined','withdrawn')`                                      |
| `decline_reason`          | TEXT | yes     | `CHECK (state <> 'declined' OR decline_reason IS NOT NULL)`. Compulsory, unlike `reason`. |
| `created_at`              | TEXT | no      |                                                                                           |
| `resolved_at`             | TEXT | yes     | `CHECK ((state = 'open') = (resolved_at IS NULL))`                                        |
| `resolved_by_member_id`   | TEXT | yes     | Not necessarily the uploader: an admin can act first.                                     |
| `item_uploader_member_id` | TEXT | no      | **Snapshot** at request time                                                              |
| `item_captured_at`        | TEXT | yes     | Snapshot                                                                                  |
| `item_storage_key`        | TEXT | yes     | Snapshot, so a settled request can be correlated with a backup                            |

**`SET NULL` on `item_id` is the interesting choice, and two passes reached it
independently.** The commonest way a removal request ends is that somebody
deletes the item. CASCADE therefore destroys the request in exactly the case
where the record matters most, and the settled tab would be permanently empty
of deletions. RESTRICT is worse: it makes the resolution impossible, because
deleting _is_ the resolution. So the row survives its item and the snapshot
columns carry what the settled card still renders.

Two consequences: the settled card **cannot show a thumbnail** for a deleted
item, because the object is genuinely gone (the surface now shows the ghost
frame instead); and the uploader's queue must be scoped by
`item_uploader_member_id`, not by a join to `items`, or a join drops every
deleted row and an uploader loses their own resolved history.

**Indexes**

```sql
CREATE UNIQUE INDEX removal_requests__one_open_per_asker
  ON removal_requests (item_id, requested_by_member_id) WHERE state = 'open';
CREATE INDEX removal_requests__open_by_uploader
  ON removal_requests (item_uploader_member_id, state, created_at);
CREATE INDEX removal_requests__by_state ON removal_requests (state, created_at);
CREATE INDEX removal_requests__by_item
  ON removal_requests (item_id) WHERE item_id IS NOT NULL;
```

The partial unique is deliberate: one person cannot have two open requests on
one photograph, but a declined request offers "Ask again", which a full unique
would forbid. `removal_requests__by_item` is the child-delete index for the
`SET NULL` on `item_id` (§ Conventions).

Deleting acts on **every** open request for that item, not just the one being
answered.

**That sentence is a handler contract, and nothing in the database enforces
it.** The partial unique above stops working the moment `item_id` goes null,
because SQLite treats distinct nulls as distinct inside a unique index, so
`(NULL, 'ines')` never collides with `(NULL, 'ines')`. Proven while building
migration 0005: after deleting a real item and letting `ON DELETE SET NULL`
fire, the same asker took three simultaneously-open requests, all accepted.

It does not arise if the contract is kept, because settling every open request
in the same transaction as the delete means no request is still `open` when
`SET NULL` reaches it. A handler that forgets leaves rows this index cannot
police.

**If you want the database to hold the line, the constraint is
`CHECK (state <> 'open' OR item_id IS NOT NULL)`.** It makes the invariant
real: an open request must name a photograph, and within `state = 'open'`
`item_id` is then never null, which restores the partial unique to full
strength. The cost is that deleting an item with unsettled requests fails
loudly instead of silently producing unpoliceable rows, which is arguably the
point. Not added in migration 0005, because it changes the semantics of
deleting an item and that is a decision for whoever writes the delete path
rather than for the migration.

---

## Upload

### `upload_sessions`

First-class because the notification is keyed to it, because it is the resume
unit, and because the done state reports on it as an object.

`id`, `uploaded_by` (RESTRICT), `state` (`draft`/`uploading`/`settled`/`cancelled`),
`visibility_rule_id` (FK `visibility_rules(id)` RESTRICT), `file_count`,
`total_bytes`, `client_timezone`, `created_at`, `committed_at`,
`last_activity_at`, `settled_at`, `notified_at`, `notified_member_count`.

`visibility_rule_id` is a single column rather than a per-session subject
table, which is the hoisted-rules decision paying for itself. Ingest copies the
id onto each item; items never _reference_ the session's rule, or editing one
photograph's visibility a month later would silently change the other 263.

Not stored: `done_count`, `failed_count`, `bytes_transferred`. All are a
`GROUP BY state` over at most a few hundred rows on a covering index, and
denormalising them invites drift on the surface where a wrong count is most
visible.

### `upload_files`

The per-file state machine and the manifest that makes a batch resumable.
**Separate from `items` on purpose**: a refused PDF and a file that never
arrived are never items, and an `items.state = 'pending'` would put
`AND state = 'ready'` into every read query in the product, where one missed
predicate leaks a half-uploaded photograph into a timeline whose entire job is
to hide things reliably.

`id`, `upload_session_id` (CASCADE), `item_id` (**SET NULL**), `position`,
`original_filename`, `declared_content_type`, `declared_bytes`, `content_hash`,
`kind`, `storage_key`, `state` (`waiting`/`sending`/`done`/`failed`/`refused`/`cancelled`),
`attempt_count`, `presigned_until`, `multipart_upload_id`, `problem_code`,
`problem_detail`, `captured_at`, `capture_date`, `capture_offset_minutes`,
`capture_source`, `original_captured_at`, `width`, `height`, `duration_ms`,
`created_at`, `updated_at`.

**`original_captured_at` is frozen when the ladder first runs and is never
written again**, exactly as its namesake on `items` is, and ingest copies
**this** column into `items.original_captured_at` rather than the possibly
amended `captured_at`. Without it the upload surface's own date fix quietly
destroys the thing Decision 10 promises: an uploader corrects a date before
committing, ingest freezes the correction as though the file had said it, and
"revert to what the file said" reverts to what a person typed. The correction
is still the right default to carry forward; it is just not the original.

`SET NULL` on `item_id`: deleting a photograph later must not erase the record
that a file arrived, since the upload history is the only place the original
filename and the transfer outcome live.

**Indexes on `upload_sessions`**: `(uploaded_by, state)`, for
`GET /api/upload-sessions/current` and the one-open-session conflict check on
`POST /api/upload-sessions`. Both read "this member's non-terminal session",
which is the leading-column shape.

**Indexes on `upload_files`**: `UNIQUE (upload_session_id, position)`;
`UNIQUE (storage_key) WHERE storage_key IS NOT NULL`;
`UNIQUE (upload_session_id, content_hash) WHERE content_hash IS NOT NULL` for
idempotent retry; `(upload_session_id, state)` for progress and the settle
latch; and `(item_id) WHERE item_id IS NOT NULL`, the child-delete index for
the `SET NULL` above (§ Conventions), without which every item delete scans
every file ever transferred.

### Exactly one email when the last file lands

Run after every terminal file transition:

```sql
UPDATE upload_sessions
   SET state = 'settled', settled_at = :now
 WHERE id = :session_id
   AND committed_at IS NOT NULL
   AND settled_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM upload_files
                    WHERE upload_session_id = :session_id
                      AND state IN ('waiting','sending'));
```

If `changes() = 1`, this caller and only this caller enqueues the email, in the
same transaction. SQLite serialises writers, so no other locking is needed, and
the `NOT EXISTS` is an index seek that stops at the first non-terminal row.

Four consequences worth stating:

- **Latch on `settled_at`, not `notified_at`.** Mail is the spec's named single
  point of failure, so a batch must be able to finish while mail is down, with
  a retryable outbox row waiting.
- **A partial batch still sends.** Failures are terminal states.
- **"Try the one that dropped" sends nothing.** A retry flips the file back to
  `waiting`, but `settled_at` is already set, so the latch refuses to fire
  again and the recovered photograph appears silently.
- **An abandoned batch needs a sweeper.** A closed browser otherwise leaves
  files `waiting` forever and nobody is told about the 200 that did arrive. A
  periodic job marks non-terminal files `failed` with
  `problem_code = 'abandoned'` after a grace period, then runs the same latch.
  **This is the single most important piece of upload plumbing the mockup does
  not show.**

**A reloaded browser resumes the same batch.** The session is found by
`created_by` plus a non-terminal state, and the surface says "200 of your 264
are up. These 64 are still to come", listing the filenames. Re-selected files
match back to `upload_files` rows by content hash, so anything that did land is
skipped rather than re-sent.

This is what makes the persisted edit plan worth having: the tags, people,
milestones and visibility all survive the reload, and the batch still settles
once and sends one email rather than splitting into two. Decision 15.

### `upload_batch_edits` and `upload_batch_edit_targets`

The "What you have added" list, persisted rather than held in the browser.

`upload_batch_edits`: `id`, `upload_session_id` (CASCADE), `kind`
(`tag`/`person`/`milestone`), `tag_id`, `person_id`, `milestone_id`,
`label_snapshot`, `created_by`, `created_at`, `undone_at`, `applied_at`.

**The three subject columns take different delete rules, which this list does
not give and migration 0006 had to settle.** `milestone_id` is **CASCADE**,
because `DELETE /api/milestones/:milestoneId` promises nothing blocks it:
`RESTRICT` would break that promise, and `SET NULL` would leave a milestone
edit naming nothing, since a milestone never gets a `label_snapshot` to fall
back on. `tag_id` and `person_id` are **RESTRICT**, which cannot fire because
no route deletes either, and which is right for a tag chosen from the picker:
it carries no snapshot, so nulling it would leave the same empty edit.
`created_by` is `NOT NULL` and `RESTRICT`, matching `items.uploaded_by`.

**The constraint across those columns is "at least one of an id or a label",
not an exclusive one.** Ingest writes the resolved `tag_id` back onto a row
that already carries a `label_snapshot`, so an exclusive constraint would
reject that write-back on every batch containing a new tag. Migration 0006
nearly set that trap and caught it by probing the post-ingest update.

`upload_batch_edit_targets`: `id`, `upload_batch_edit_id` (CASCADE),
`upload_file_id` (CASCADE). `UNIQUE` on the pair, indexed on the file, because
ingest runs the other way round.

**Indexes on `upload_batch_edits`**: `(upload_session_id, created_at)`, which
is the surface's own list, newest last, and what `POST /commit` freezes and
ingest reads once per session. It is also the child-delete index for the
session CASCADE (§ Conventions), since it leads with `upload_session_id`.

Persisting costs three to five extra rows per batch and buys: one row per bulk
action rather than one per file per action; a server-authoritative fan-out at
ingest rather than a 264 x 3 payload replayed from a browser that may have been
reloaded; and survival of a reload on the metadata step, which on a phone is a
real event. The blobs die with the page, but the twenty minutes of tagging do
not.

**One asymmetry worth knowing.** A new _tag_ or _person_ typed into the bulk
modal gets its row at **ingest**, not when Enter is pressed: `label_snapshot`
carries it meanwhile, and an abandoned batch must not pollute the vocabulary
the whole product filters by, especially since the picker's design leans on
those counts to tell a real tag from a typo. A new _milestone_ is the opposite,
because the surface promises "It appears in the timeline on those dates
straight away", so its row is written immediately and an abandoned batch leaves
an empty milestone. That is fine: an empty milestone is already a designed
state.

### Capture dates

The ladder, recording `capture_source` at each rung: EXIF `DateTimeOriginal`
with its offset; QuickTime/MP4 `creation_time` (reject implausible values);
a filename pattern such as `IMG_20260914_064132`, which is surprisingly
reliable for exactly the files that went through a messaging app and have no
EXIF; the File API's `lastModified`; the uploader saying so; and finally the
commit time.

With no offset available, resolve in **`shoebox.timezone`** rather than UTC,
and leave `capture_offset_minutes` null so the guess stays distinguishable.

This section previously said `upload_sessions.client_timezone`, and Decision 10
overrules it: the day a photograph lands on must not depend on where the
uploader was standing, or the same file uploaded by two people lands on two
different days. `client_timezone` stays on the session as a record of what the
browser claimed, which is worth having when a date later turns out wrong, but
nothing resolves against it.

**Gap in the mockup**: there is no rung-5 affordance. The days list groups by
capture date and has no group for "these did not say when they were taken", so
a WhatsApp forward is silently filed under today and nobody will ever notice.
A group at the top of the list with one date picker would fit the existing
shape and needs no new tables.

### `pending_object_deletions`

`id`, `storage_key` (UNIQUE), `attempts`, `last_error`, `created_at`,
`last_attempted_at`.

There is no transaction spanning SQLite and Backblaze. A delete must commit the
rows first, so the item genuinely vanishes, and then delete the objects, which
can fail. Without this table a B2 failure leaves a family paying to store a
photograph they were told was destroyed, with no record that it is still there.
Enqueue every rendition's key inside the same transaction as the row delete,
then drain.

---

## Deleting an item: the cascade matrix

**Nothing blocks.** The spec is unambiguous in three places, and a `RESTRICT`
anywhere on an item's dependents would turn "please take that one down" into an
error message. Both plausible candidates for blocking fail on inspection: an
open removal request should not block, because deleting is how you grant it,
and a burst with siblings should not block, because deleting one frame of
forty-five is ordinary.

| Dependent                   | Behaviour                                  | Note                                                                                                                       |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `comments`                  | CASCADE                                    | The delete modal says so in as many words.                                                                                 |
| `comment_reactions`         | CASCADE, **transitively** via the comment  | The cascade a polymorphic reactions table would not have given you.                                                        |
| `item_reactions`            | CASCADE                                    |                                                                                                                            |
| `item_tags`                 | CASCADE                                    | `tags` rows survive.                                                                                                       |
| `item_people`               | CASCADE                                    | `people` rows survive, which is what keeps somebody findable after their only photograph comes down.                       |
| `item_milestones`           | CASCADE                                    | The milestone survives, possibly empty, which is a designed state.                                                         |
| `item_views`                | CASCADE                                    |                                                                                                                            |
| `item_renditions`           | CASCADE, **plus an object delete per row** | The only cascade with a side effect outside the database. Enqueue into `pending_object_deletions` in the same transaction. |
| `item_capture_date_changes` | CASCADE                                    |                                                                                                                            |
| `upload_files.item_id`      | SET NULL                                   | The transfer record outlives the photograph.                                                                               |
| `removal_requests.item_id`  | **SET NULL**                               | The one exception, so takedown history survives the takedown.                                                              |
| `bursts`                    | **Application code**                       | Drop the burst when its last frame goes. No foreign key direction does this.                                               |
| `visibility_rules`          | Untouched                                  | Shared. A separate sweeper drops unreferenced rules.                                                                       |

**Authorisation**, which the schema cannot express and the handler must:
`items.uploaded_by = :me OR members.role = 'admin'`.

### Removing a member

One transaction: set `status = 'removed'` and `removed_at`, delete their
`sessions`, delete their `group_members`, recount active admins and roll back
on zero. Nothing touches items, comments, reactions or the linked person row.

**That last sentence and the cascades on the reaction tables disagree, and the
disagreement is harmless only because members are never hard-deleted.**
§ Reactions gives `item_reactions.member_id` and `comment_reactions.member_id`
as `CASCADE`, which would take somebody's reactions with them. Two things stop
it mattering: removal is a `status` change rather than a delete, so the
cascades never fire; and `comments.author_member_id` is `RESTRICT`, so a hard
delete attempted in a shell would be refused before any cascade ran. Built as
specified in migration 0004, and written down here because a reader who takes
the `CASCADE` as intent, rather than as a consequence that cannot arise, might
conclude a hard delete is supported. It is not.

---

## Operations

### `settings`

Scoped key/value, with the type registry in `packages/shared`.

`id`, `scope` (`CHECK IN ('instance','member')`), `scope_id` (null for
instance, `CHECK ((scope = 'member') = (scope_id IS NOT NULL))`), `key`,
`value` (JSON-encoded scalar), `updated_at`, `updated_by_member_id` (SET NULL).

SQLite treats nulls as distinct in a `UNIQUE`, so a plain
`UNIQUE (scope, scope_id, key)` would allow two instance rows for the same key.
Two partial indexes instead:

```sql
CREATE UNIQUE INDEX settings__one_instance_value ON settings (key) WHERE scope = 'instance';
CREATE UNIQUE INDEX settings__one_member_value   ON settings (scope_id, key) WHERE scope = 'member';
```

PRODUCT.md requires the settings model to allow instance-level and per-member
from the start, and typed columns on a singleton row only allow for it by
promising a second table later. The loss is database-level typing, which this
codebase already recovers in the layer where it belongs: a `SETTING_DEFINITIONS`
registry in `packages/shared` gives each key its Zod schema, its default and the
scopes it permits, and both halves of the app read the same object. That also
keeps the default `"My Shoebox"` beside its key rather than buried in DDL,
which matters because a fresh instance should have **zero** settings rows and
still render correctly.

Keys today: `shoebox.name` (default `"My Shoebox"`, instance only),
`pile.arrangement` (`tidy`/`messy`, default `messy`, instance only, and the
registry's scope restriction is what stops somebody quietly making it a
personal preference later), `mail.from_address`, `mail.from_name`,
`mail.domain_verified_at`, `mail.domain_last_check_error`,
`public.base_url`, `shoebox.timezone` and `visibility.generation`, which is
the integer the auth middleware bumps to invalidate every viewer's cached rule
expansion at once. That last one was missing from this list and is in the
shipped registry, where `conventions.md` and `administration.md` both expect
it.

`public.base_url` is easy to forget and every email is broken without it,
because an absolute link is the only kind an email can carry.

**`shoebox.timezone`** is an IANA zone (`"Europe/Madrid"`), instance only,
seeded from the admin's own browser zone the first time they open Shoebox
settings. It is the zone every date in the product resolves in:

| Reads it                                                 | Was previously                |
| -------------------------------------------------------- | ----------------------------- |
| `items.captured_on`, when the file carried no UTC offset | the server's zone, implicitly |
| The activity log's day boundary                          | undefined                     |
| The weekly removal reminder's clock                      | undefined                     |

One zone for the whole Shoebox rather than one per member, because the archive
has a single organisation and a photograph must not land on a different day for
your aunt than for you. The alternative makes the day a file lands on depend on
where the uploader was standing, so the same file uploaded by two people could
land on two different days. Decision 10.

**The four `members.notify_on_*` switches stay columns on `members`, not
settings keys.** They are filters in every notification query and want a
predicate, not a JSON decode.

The storage figures on the settings surface are **computed, not cached**:
`SELECT count(*), sum(byte_size) FROM items` over a few thousand rows is
sub-millisecond, and a cache here is a correctness risk bought with nothing.
Note the figure is _indexed media_, not bucket truth: thumbnails live in the
same bucket under their own prefix and orphans will drift.

### `outbound_emails`

One table that is both a queue and a permanent log.

`id`, `kind`, `to_address` (denormalised, because an invitation has no member
and the address a message went to must survive a later change), `to_member_id`
(SET NULL), `from_address` (the one actually used), `subject`, `payload_json`,
`trigger_kind`, `trigger_id` (**no foreign key**, deliberately: the trigger can
be deleted and the mail record must outlive it), `idempotency_key` (UNIQUE),
`state` (`queued`/`sending`/`sent`/`failed`/`cancelled`/`suppressed`),
`send_after`, `attempts`, `next_attempt_at`, `provider_message_id`,
`provider_request_id`, `last_error_code`, `last_error_message`,
`delivery_state`, `delivery_updated_at`, `created_at`, `sent_at`.

`payload_json` holds **resolved values, not ids**, so a retry a day later
renders the same message even if the comment was edited or the item deleted.
Scrub it for `sign_in_code` rows once terminal, **and scrub `subject` with
it.** The sign-in email deliberately carries the six digits in its subject line
so the code can be read off a lock screen, which means the subject column is
otherwise a permanent log of live-looking codes sitting beside the address each
was sent to. Scrubbing `payload_json` alone would leave the more exposed copy
of the two.

**Indexes**: `UNIQUE (idempotency_key)`; `(state, next_attempt_at)` for the
worker's claim; `(state, created_at)` for the health grouping behind
`GET /api/mail/health`.

**What cancels a queued row, and what does not.** Deleting a comment cancels
its notification while `state = 'queued'` and never once it is `sending` or
terminal: a message already handed to the provider cannot be recalled, and
pretending otherwise in the schema invites a handler that tries. **Editing a
comment cancels nothing** (Decision 8), because `payload_json` froze at enqueue
and the whole purpose of that snapshot is that a retry cannot produce a
different message from the same row.

**Setting `public.base_url` requeues what failed on it.** Rows with
`state = 'failed'` whose failure was `base_url_unset`, and which are less than
seven days old, flip back to `queued` with their absolute link fields
recomposed from `trigger_kind` and `trigger_id`. Nothing else in the payload is
touched. This is the one sanctioned rewrite of `payload_json` and it does not
breach the purity rule: that rule stops a retry disagreeing with an earlier
correct render, and a message composed without a base URL was never renderable,
so there is no earlier version to disagree with. The seven-day cap is what
stops a base URL set a month late delivering a month of stale mail at once.

The recipes:

| Kind               | Key                                                      |
| ------------------ | -------------------------------------------------------- |
| `sign_in_code`     | `signin:<code_id>`                                       |
| `invitation`       | `invite:<invitation_id>:<send_count>`                    |
| `upload_session`   | `upload:<session_id>:<member_id>`                        |
| `comment`          | `comment:<comment_id>:<member_id>`                       |
| `removal_request`  | `removal:<request_id>:<member_id>`                       |
| `removal_reminder` | `removal-reminder:<request_id>:<member_id>:<week_index>` |
| `removal_resolved` | `removal-resolved:<request_id>:<member_id>`              |

All three removal messages are designed copy on surface 16, not just recipes:
`removal_resolved` renders as **"it is gone"** to the requester and the
uploader when the item comes down, and as **the decliner's own words** to the
requester when it does not. `removal_reminder` goes weekly to whoever can act
until somebody does. The removal flow exists because a request answered with
silence turns into a phone call, so silence is the exact failure mode it is
built to avoid. Decision 12.

`week_index = floor((now - request.created_at) / 7 days)` is the neat one. A
cron can run hourly, blindly `INSERT ... ON CONFLICT DO NOTHING`, and it is
then arithmetically impossible to send two reminders in one week. No scheduler
state, no "last reminded at" column to drift.

**The job must require `week_index >= 1`.** Week zero is the week of the
request itself, so without the guard the first "still waiting" reminder goes
out within the hour of somebody asking, chasing an uploader who has not yet had
a chance to read the original.

Claiming a row is `UPDATE ... SET state = 'sending' WHERE id = ? AND state = 'queued'`,
proceeding only if `changes() = 1`.

Companion tables: `email_delivery_events` (`email_id` CASCADE, `event`,
`occurred_at`, `received_at`, `detail_json`, `UNIQUE (email_id, event,
occurred_at)` for webhook replay safety) and `email_suppressions` (`address`
UNIQUE, `reason`, `cleared_at`).

**A suppressed address still gets sign-in codes.** A spam complaint must never
lock a family member out of their own archive, and the repeated failure is
itself the diagnostic.

**The sign-in path must never surface a mail failure to the person typing an
address.** Leaking "we could not send to that address" turns the form into a
membership oracle. That failure belongs in the admin banner only.

No separate `mail_status` table: everything the failing-mail banner prints is a
query over `outbound_emails` plus the two `mail.domain_*` settings keys.

### Recipients, which is the expensive part

"Everyone who can see at least one item in the batch" means evaluating
visibility per member before sending. Do it as one set operation, never a loop.
With hoisted rules it is: expand each candidate member to their visible rule
set, then intersect with the distinct rule ids in the batch. In the normal case
the whole batch shares one rule, so it is one comparison against nine members.

The result is a **snapshot**. If visibility changes between enqueue and send
the message is stale, and that is the right trade: re-evaluating at send makes
retries non-deterministic.

**The count in the email is the recipient's own.** Ines gets "3 photos from
14 September"; Abuela gets 210. The body renders per recipient and
`payload_json` carries that member's figure, so one `outbound_emails` row still
means one message.

The counting rule that governs the whole product admits no exception, and a
shared total is a side channel stating how much exists beyond what the reader
can open. The cost is nothing extra: the recipient query already computes a
per-member visible count while working out who to send to, so this is one
render per recipient rather than one per batch. Decision 4.

---

## Usage and audit

The owner's question is _who cares_, not _how many sessions_. That changes the
design: the valuable records are sparse and durable, and the worthless ones are
dense and disposable. So the dense ones are collapsed out of existence at the
point of writing rather than retained and rolled up later.

### `item_views`, which is bounded by content rather than by behaviour

This one table answers both the accent dot and "who has looked at this".

`id`, `member_id` (CASCADE), `item_id` (CASCADE), `first_seen_at` (set once,
never updated), `first_opened_at`, `last_opened_at`, `open_count`.

`UNIQUE (member_id, item_id)` is the upsert target and the timeline's
anti-join. Plus `(item_id, member_id)` for the reverse direction, a partial
`(item_id) WHERE first_opened_at IS NOT NULL`, and its mirror
`(member_id) WHERE first_opened_at IS NOT NULL`, which is what surface 17
groups by when it counts what each member has opened.

**`first_seen_at` and `first_opened_at` are different facts and both get
written.** Opening an item at full size latches both. A burst's sibling strip
latches `first_seen_at` only, for every visible sibling, in one batched
`INSERT ... ON CONFLICT DO NOTHING` per (viewer, burst): those thumbnails have
been in front of the viewer, so the accent dot goes out, and they were not
opened, so surface 17's "scrolled past, never opened" row stays honest.

**The arithmetic is the argument.** For eight active members and a few thousand
items a year:

| Strategy                       | Rows per year     | Bound                                                         | Storage      |
| ------------------------------ | ----------------- | ------------------------------------------------------------- | ------------ |
| One row per impression         | 400k to 1.2M      | Unbounded; scales with how much the family enjoys the product | 40 to 120 MB |
| One row per full-size open     | 30k to 90k        | Unbounded, grows forever                                      | 3 to 10 MB   |
| **One row per (member, item)** | **~12k new rows** | **Bounded at members x items: ~290k after a decade**          | **~1 MB**    |

Per-impression logging is the trap, and it is easy to fall into because the
interface genuinely needs impression tracking for a different reason: the
accent dot is load-bearing and the spine prints "31 new", so the count has to
fall as somebody scrolls. But the admin's question is not improved by knowing
that Rosa's viewport crossed the same thumbnail forty times, and punishing a
family for scrolling with a million rows a year on a single-writer SQLite file
that is also taking uploads buys nothing.

The collapse resolves both:

- **Seen is a one-way latch.** `INSERT ... ON CONFLICT DO NOTHING`. Scrolling a
  212-item day writes 212 rows the first time and **exactly zero** every time
  after. The client can suppress even the request, since it already knows which
  prints are showing a dot. Steady-state browsing of a familiar archive costs
  no writes at all.
- **Opened at full size** is the real signal of interest, and gets a counter
  and a timestamp on the same row. No table growth.

Deliberately absent: `last_seen_at`. Maintaining it reintroduces a write on
every impression, which is the whole cost the collapse avoids, and no question
in the brief needs it.

**A new member is seeded at first sign-in.** One statement inserts a
`first_seen_at` row for every item that already exists, so the accent dot means
**"arrived since you joined"** rather than "exists".

Without it, all 2,147 items carry a dot on a member's first morning, they
scroll a few days, and several hundred stay marked new forever. That is worse
than a wall, because it is a permanent lie that drains the accent of meaning
everywhere else in the product. Roughly 17,000 inserts for a nine-person
Shoebox, once, in milliseconds. Pair it with one line on the timeline the first
time, so the size of the archive is said in words rather than in dots.
Decision 3.

**Neither retention nor rollup is needed**, which is the payoff worth writing
in the migration comment: the table is bounded by content, so it cannot run
away no matter how much the archive is used.

### `activity_events`

Wide, sparse, append-only. **It records only what the state tables cannot
answer later**, which is deletions and any change to who may see what or who
may do what.

`id`, `kind`, `occurred_at`, `actor_member_id` (SET NULL), `actor_label`
(denormalised name and address as they were), `subject_kind`, `subject_id`
(**no foreign key**), `subject_label`, `device_id` (SET NULL), `device_label`
(denormalised, for the same reason as the other two), `detail_json`.

**`subject_id` having no foreign key is the central design point.** An audit
log outlives its subjects by definition, so an `item_deleted` row must hold a
dangling id. Referential integrity here would either forbid the row or cascade
it away exactly when it becomes valuable. Orphan ids are expected and correct.

`actor_label` and `subject_label` are denormalised for the same reason: the log
has to read correctly with no join, after the rows are gone.

**`device_label` is denormalised too, and it is the one that looks optional.**
`device_id` is `SET NULL` to `sessions`, which fall out at 30 days idle, so
without this column surface 18 reads "device no longer known" on every row
older than a month, which is most of the log. A wide, sparse, append-only table
is exactly where one more text column costs nothing.

Kinds worth recording:

| Family      | Kinds                                                                                                                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access      | `sign_in_code_requested`, `signed_in`, `sign_in_failed`, `signed_out`, `device_revoked`, `session_expired`                                                                                                                          |
| Authority   | `member_invited`, `invitation_revoked`, `invitation_accepted`, `member_role_changed`, `member_removed`, `group_created`, `group_renamed`, `group_membership_changed`, `group_deleted`, `item_visibility_changed`, `setting_changed` |
| Destruction | `item_deleted`, `comment_deleted`, `milestone_deleted`                                                                                                                                                                              |

`group_membership_changed` earns its place more than it looks: groups expand at
read time, so adding somebody to _cousins_ retroactively grants them everything
ever restricted to _cousins_. That is the most consequential invisible action
in the product and nothing else records it.

Indexes: `(occurred_at DESC)`, `(kind, occurred_at DESC)`,
`(actor_member_id, occurred_at DESC)`, `(subject_kind, subject_id, occurred_at DESC)`,
and `(device_id) WHERE device_id IS NOT NULL`, the child-delete index for the
`sessions` `SET NULL` (§ Conventions). That one fires every time a session
ends, against a table that grows forever and is never pruned, so without it
every sign-out scans the whole log. Partial because after a month most rows
already carry a null `device_id`.

At one to two thousand rows a year, ten years of history is a few megabytes.
**No retention rule**, deliberately rather than by omission: the first question
anybody asks of an audit log is about something old.

### What is _not_ logged, because another table already knows

| Fact                              | Lives in                                         | Logged?                                                                                               |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| A comment exists                  | `comments.created_at`                            | No                                                                                                    |
| A reaction exists                 | `item_reactions.created_at`                      | No                                                                                                    |
| An upload happened                | `items.created_at`, `upload_sessions.settled_at` | No                                                                                                    |
| A device was last used            | `sessions.last_used_at`                          | No, but a fresh sign-in and any revocation are, because neither is derivable from a sliding timestamp |
| A removal request and its outcome | `removal_requests`                               | No                                                                                                    |
| An email was sent                 | `outbound_emails`                                | No                                                                                                    |
| Somebody viewed an item           | `item_views`                                     | No                                                                                                    |
| **An item was deleted**           | Nothing. Both the row and the object are gone.   | **Only here**                                                                                         |
| **A role changed**                | `members.role`, current value only               | **Yes**                                                                                               |
| **Group membership changed**      | `group_members`, current state only              | **Yes**                                                                                               |
| **Item visibility changed**       | current state only                               | **Yes**                                                                                               |

The admin's single feed is then a plain read of `activity_events` and nothing
else: surface 18 shows the changes this table records and does not repeat the
comments, reactions and uploads the timeline already shows. An earlier draft
made it a `UNION ALL` over five tables; that was dropped because its three
noisiest branches buried the authority rows, which are the whole reason the
table exists. Nothing is written twice either way, and one table sorts in
microseconds rather than milliseconds (`apis/notifications.md` §
`GET /api/activity`).

### Surfaces 17 and 18 read all of this

**"Who has viewed this photograph"** is a range scan of at most nine rows on
`(item_id, member_id)`, ordered so that people who actually opened it sit above
people who merely scrolled past. That distinction is the one the owner cares
about.

**"When did each member last sign in"** is `members.last_signed_in_at`, written
in the transaction that redeems a code. Nine rows, no scan. The event log is
the history behind that column, not the source of it. Note this is **not** the
"Last seen" the Members table shows, which is last activity; under a sliding
session the two differ by up to thirty days and both are wanted.

**"Who cares"**, the owner's own phrasing, is a row per member carrying last
signed in, days active, items opened, comments written and reactions left,
ordered by who is most present. At nine members every figure computes live from
`item_views`, `comments` and the two reaction tables in one grouped query per
column, so no rollup is needed yet. Decision 11.

The surface is also the right place to state plainly what is **not** recorded,
which is the section below and matters in a product whose pitch is privacy.

### `member_active_days` (deferred)

`member_id`, `day`, `items_seen`, `items_opened`, `comments_written`,
`reactions_left`, `first_at`, `last_at`. `UNIQUE (member_id, day)`.

At most 8 x 365 rows a year. This is the "who cares" answer precomputed, and
it is derivable from the tables above, so it stays deferred: surface 17
computes live at this scale. Build it when a grouped query over `item_views`
stops being instant, which for a family archive is years away and may never
come.

### Privacy: what is deliberately not recorded

This is a family archive, and the logging should read as though a family member
might one day see the schema.

- **No IP addresses and no location.** Not stored, not resolved, not logged.
  There is no GeoIP lookup anywhere in the product, so the address never
  reaches the database or the application logs in any form, coarse or
  otherwise.
- **No raw user-agent strings beyond the parsed label.**
- **No dwell time, scroll depth, hover or click coordinates.** This is the part
  that would quietly turn into analytics.
- **No video watch position.** A pinned comment is content somebody chose to
  leave. Recording that Rosa stopped the clip at 0:14 eleven times is
  surveillance of exactly the person the product is trying to delight.
- **No search or filter term log.** The creepiest datum available here, and it
  answers none of the owner's questions.
- **No read receipts on comments.** "She saw my message and did not reply" is a
  family argument the software should not enable.

**View data is admin-only.** A member seeing that her son opened her photograph
fourteen times and said nothing would change the character of the product in a
way nothing in the spec asks for. An anonymous aggregate is not a compromise:
with nine members, "seen by six" plus a visible reaction list narrows to a
name. The only view-derived thing an ordinary member sees is their own unseen
dot, which is about them and reveals nothing about anybody else. A member
should be able to see their own full record.

---

## Notes for whoever writes the API contract

The DTO is not the row. Six things in the fixtures look like columns and are
not, and every one of them has to be computed at the boundary.

| Looks like a column                                                                                       | Actually                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tag.itemCount`, `Person.itemCount`, `Milestone.itemCount`, `ArchiveDay.itemCount`, a burst's frame count | Per-viewer aggregates. Never stored.                                                                                                                      |
| `Device.current`                                                                                          | `row.id === requesting_session.id`                                                                                                                        |
| `Device.lastUsed` ("3 days ago"), `Member.lastSeen` ("Today"), `daysIdle`                                 | Formatted from timestamps. **No formatted date string belongs in a payload**; send the timestamp and format in the browser, where the reader's locale is. |
| `MediaRef.src`, `.thumb`, `.poster`                                                                       | Storage **keys** in the database, short-lived signed URLs in the payload, minted at render.                                                               |
| `MediaRef.runtime` ("0:22")                                                                               | `duration_ms`                                                                                                                                             |
| `Group.usedByRules`                                                                                       | A grouped count over `visibility_rule_subjects`, and the Groups list must compute all of them in **one** query, not N+1.                                  |

Three more things the contract has to get right:

- **The empty archive and the invisible archive must be byte-identical on the
  wire.** No `hiddenCount`, no `archiveIsEmpty`, no diagnostic field that
  distinguishes "nothing exists" from "nothing is yours". The surface says a
  count of what you cannot see would tell you something about it, and that is
  an API contract, easily broken by somebody adding a debug field.
- **A permalink you may not open returns 404.**
- **Comment reactions are one batched query** with `comment_id IN (...)`, never
  one per comment. That N+1 is the easiest mistake in the item viewer.

### The queries that will hurt first

Everything else on these surfaces is a handful of rows. These four scale with
the archive:

| Query                | Shape                                                                           | Note                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The jump rail        | Every visible day with a count, unbounded                                       | A covering scan of ~50k index entries. Single-digit ms, and the first thing to cache per `(member, visibility_generation)`.                                                                                                                   |
| Filter chip counts   | `GROUP BY tag_id` over `item_tags` joined to visible items                      | ~150k rows at three tags per item. 10 to 30 ms. The most expensive query on the filter surface.                                                                                                                                               |
| The people directory | `people LEFT JOIN item_people LEFT JOIN items` with counts and first/last dates | ~100k rows. **The visibility predicate must sit in the `ON` clause, not the `WHERE`**, or the left join collapses and everybody with no visible items disappears, including the person with none who is the whole point of one of the states. |
| Multi-filter results | Visibility plus a date range plus one `EXISTS` per tag and per person           | Use `EXISTS` rather than repeated joins: no fan-out duplicates, one index probe each. Drive from the most selective predicate. Run `ANALYZE`.                                                                                                 |

If those stop being fast, the fix is **rollups keyed by
`(dimension, visibility_rule_id)`** rather than by member:
`day_rule_counts`, `tag_rule_counts`, `person_rule_counts`. Because the
aggregation axis is the rule, adding somebody to _cousins_ changes nothing in
the rollup and only the read-time expansion moves, which is the property a
per-member cache cannot have. Two conditions make them safe: update them in the
same transaction as the item write, and keep a rebuild-from-scratch job so
drift can be repaired rather than debugged. **Do not build them yet.**

Cache the visible-rule expansion per `(member_id, visibility_generation)`,
where the generation is a single integer bumped whenever group membership, a
rule's subjects, or a member's role changes.

### One measured exception to the uuid rule, for a decision

The house rule is a uuid `id` on every table. On the pure join tables it is
measurably worse: a 36-byte surrogate plus a second b-tree, on tables where
every access is by one side or the other and the surrogate is never a lookup
key. `item_tags` reaches ~150k rows and `item_views` ~290k over a decade.

`PRIMARY KEY (item_id, tag_id) WITHOUT ROWID` is roughly a third of the space
and one b-tree instead of three. The tables above are written with uuid `id`s
as instructed; this is flagged once, with the numbers, so the exception is
granted or refused deliberately rather than discovered later. It affects
`item_tags`, `item_people`, `item_milestones`, `group_members` and
`item_views`.

### There is no job runner yet

Four things above need one: the sign-in code sweeper, the abandoned-upload
sweeper, the weekly removal reminder, and the `pending_object_deletions` drain.
A plain interval in the Fastify process is enough for a single-machine Fly
deployment, but it has to exist and shut down cleanly on `SIGTERM` alongside
the database.

---

## Decisions

Every question this exercise raised has been answered. They are recorded with
the reasoning, because the ones that were close will otherwise be reopened by
somebody who does not know why they went the way they did.

### 1. A member's display name

**The admin names them at invite, and the member can correct it.** The field is
optional on the invite form and pre-filled from a matching tagged person when
one exists, so inviting a grandmother the archive already knows offers her name
back. It falls back to the email local part. My account gains the same field.

The audience skews older and will not open a settings screen, so leaving it to
the member means `rosa@example.com` on every chip. Self-naming survives as a
correction rather than a requirement. **The invite copy changes**: "the person
will tell you their own name" is no longer true.

### 2. An invitation carries no credential

The email names the address and links to a join page; acceptance is the first
successful sign-in there. A forwarded invitation grants nothing, which keeps
"a link is an address, never a credential" intact on the most forwarded email
the product sends.

The link carries the address as a plain query parameter so the field arrives
pre-filled. `invitations` needs no token, no `consumed_at` and no attempt cap.
**The Members banner is wrong and changes**: it currently claims the invitation
holds a six-digit code.

### 3. A brand-new member starts with a quiet archive

At first sign-in, seed an `item_views` row for every item that already exists.
The accent dot then means **"arrived since you joined"**, which is what makes
it worth anything: the next upload lights up 46 things and they are worth
looking at.

Without this, every one of 2,147 items carries a dot, the member scrolls a few
days, and several hundred stay marked new forever. That is worse than a wall,
because it is a permanent lie that drains the accent of meaning everywhere
else. One statement, roughly 17,000 inserts, milliseconds.

Pair it with one line on the timeline the first time, so the size of the
archive is said in words rather than in dots.

### 4. The upload email counts what its recipient can see

Inés gets "3 photos from 14 September"; Abuela gets 210. The body renders per
recipient and `payload_json` carries that member's own figure.

The counting rule admits no exception, and a shared total is a side channel
saying how much exists beyond what you can open. The recipient query already
computes a per-member count while working out who to send to, so the cost is
one render per recipient rather than one per batch.

### 5. Milestones have no visibility of their own

The occasion and its name are visible to everybody; only its photographs are
restricted. This keeps the empty-milestone state working and needs no
machinery.

The create form says the name is visible to everybody, so nobody types
something into a name they would not say out loud. The rejected alternative
(hide a milestone whose every item is hidden from you) has a bad property:
attaching one restricted photograph to a previously empty occasion makes it
vanish from everybody else's timeline.

### 6. `place` is dropped

No GeoIP, no IP address handling anywhere. A device row reads
"iPhone, Safari · in use now · 30 days left", and the label plus the date
carries the recognition.

City-level lookup needs a 70MB database and a MaxMind key, which is a fourth
dependency in all but name, to distinguish devices that in a nine-person family
are mostly in the same two cities.

### 7. An uploader always sees their own uploads

The predicate is `visibility_rule_id IN (:visible) OR uploaded_by = :me`.

It cannot leak, because it only adds items the viewer put there. It is also the
only version that survives a group membership change months later: a rule that
was fine in September becomes self-excluding when an admin adds its author to
Cousins in October, and no write-time check can catch that.

**This must not extend to items you are people-tagged in.** A people tag is
never a key.

### 8. A comment can be edited and deleted by its author

Edits carry an **edited** marker, which adds `edited_at` to `comments`. Admins
keep "delete anything" from the roles table, and an admin deleting somebody
else's comment is recorded in the activity log. Deleting a comment takes its
reactions with it.

Note the limit: the notification email quotes the comment as it was sent, and
an edit cannot catch a message already delivered.

### 9. Alt text is generated, with an optional override

Composed at render from the people tags and the capture date
("Mateo and Papá, 14 September 2026"), falling back to the date alone. An
uploader or admin can type a real description on the item viewer.

Every photograph gets something honest without anybody describing 264 files,
and who is in it and when are exactly what somebody listening wants to know.

### 10. One Shoebox timezone, and dates are correctable

A `shoebox.timezone` setting, defaulting to the admin's own zone the first time
they open Shoebox settings. Everything without an EXIF offset resolves in it.

The alternative makes the archive's organisation depend on where the uploader
was standing, so the same file uploaded by two people could land on two
different days. The setting also fixes the two other places with no timezone at
all: the activity day boundary and the weekly reminder clock.

**An item's date and time can also be corrected by hand**, by its uploader or
an admin, from the item viewer. That was anticipated by the model
(`capture_source = 'uploader_set'`, `reason = 'manual'`) and needed only a
surface. Note the two columns take different values and are not interchangeable:
`items.capture_source` records **how** the date was arrived at and has no
`'manual'` member, while `item_capture_date_changes.reason` records **why** it
was changed and does.

Two consequences follow from rules already settled:

- Moving an item off its burst's day **ejects it from the burst**, because a
  burst is a same-day run by definition.
- Moving it outside an attached milestone's span raises the **existing**
  mismatch flow rather than a new one.

Every change writes an `item_capture_date_changes` row, and
`items.original_captured_at` stays frozen, so "revert to what the file said" is
always one step away.

### 11. A seventeenth surface: who has been looking

Admin only. A row per member carrying last signed in, days active, items
opened, comments written and reactions left, in the figure type the day spine
uses, ordered by who is most present. Plus, on a photograph, the list of who
has opened it.

This is the owner's stated priority and nothing answered it. The surface is
also the right place to state plainly what is **not** recorded, which matters in
a product whose pitch is privacy.

At nine members it computes live from `item_views`, `comments` and the two
reaction tables, so `member_active_days` stays deferred.

### 12. Four more transactional emails

Surface 16 goes from five to nine: **it is gone** to the requester and the
uploader, **the decliner's own words** to the requester, a **weekly reminder**
to whoever can act until somebody does, and **never mind** to the uploader and
the admins when the asker withdraws.

The removal flow exists because a request answered with silence turns into a
phone call, so silence is the failure mode it is specifically built to avoid.
That argument runs in both directions, which is what the fourth one adds: the
uploader and the admins are told somebody asked, and nagged weekly until
somebody acts, so they are also told when the asking stops rather than left to
notice an absence in a queue. The reminder is already in the schema as an
idempotency recipe; leaving it undesigned would ship a real email with no
reviewed copy. All four are outcomes of two existing kinds, so the schema gains
nothing: see `apis/notifications.md` §§ 6 to 9.

### 13. Filter chip counts narrow

Each chip shows what adding it to the current selection would give, so `beach 0`
appears before anybody presses it and the no-results dead end becomes
unreachable by accident. Zero-count chips stay visible and go quiet rather than
disappearing, because a row that reshuffles under your finger is worse, and `0`
is itself information.

This recomputes the most expensive query on the surface whenever a filter
changes rather than once. At 10 to 30 ms on a user-initiated action that is
affordable; debounce the text field.

### 14. One full milestone band per day

The narrowest span wins and everything else on that day is a continuation
strip; ties break by earliest start. So 17 September opens with "Home from the
hospital" and carries "Mateo's first week at home · day 1 of 5" beneath it.

The narrower span is the more specific thing to say about that day, the day
keeps one headline, and a longer occasion still opens as a full band on the
first of its days where nothing narrower competes.

### 15. A reloaded upload resumes

"200 of your 264 are up. These 64 are still to come", with the filenames
listed. Re-selected files match back to manifest rows by content hash, so
anything that did land is skipped rather than re-sent.

This is what makes the persisted edit plan worth having: the tags, people,
milestones and visibility all survive, and the batch still sends one email
rather than splitting into two.

### 16. Email preferences are per kind

Four switches on My account: somebody puts photographs up; somebody comments on
something of yours; somebody comments on something you commented on; somebody
asks for a photograph of you to come down.

**Four boolean columns on `members`**, not settings rows: a notification query
filters on them directly, so they want to be a predicate rather than a join and
a JSON decode. "Turn them all off" is a convenience action, not a fifth column.

Sign-in codes are not in the list and cannot be turned off, because without
them there is no way back in. A suppressed address still gets them.

### 17. An eighteenth surface: what has been changed

`activity_events` had no reader. The table's justification is that it records
**only what the state tables cannot answer later**, and the strongest case in
it is `group_membership_changed`: groups expand at read time, so adding
somebody to a group retroactively grants them everything ever restricted to it,
which is the most consequential invisible action in the product. A log nobody
can open does not close that gap.

Surface 18 opens it, and is deliberately narrower than the feed first drafted
for it. It reads this table and nothing else. Comments, reactions and uploads
were going to arrive through a `UNION ALL` over four more tables; they are not
logged precisely because the timeline already shows them, and three noisy
branches would have buried the rows the surface exists for.

**No schema change.** Every column the surface needs is already here, including
the three that look like over-engineering until something reads them:
`actor_label` and `subject_label`, which let a row about a deleted photograph
still say what it was, and `subject_id` having no foreign key, which is what
lets that row exist at all. The `(kind, occurred_at DESC)` index finally has a
caller, the family filter.

---

## Still genuinely undecided

Nothing.

**How a burst is detected**, the last open item, is settled. Capture-time
proximity within a single upload is the only signal, and the two parameters
live in [`app.config.ts`](../../../../app.config.ts) rather than in this
schema: frames no more than `burst.maxGapSeconds` (**10**) apart, and at least
`burst.minimumFrameCount` (**3**) of them. The reasoning for both numbers is
in that file's comments, and the short version is that 10 seconds is what it
takes to hold together the run the product was designed around (45 frames
between 06:41 and 06:44, one every 4 seconds on average, with uneven real
gaps) without collapsing a whole morning of casual shooting.

`bursts.threshold_seconds` and `bursts.detector_version` stay on the row and
are now doing the job they were added for: they record which configuration
produced each burst, so changing either number re-derives the automatic
groupings without touching anybody's manual one.
