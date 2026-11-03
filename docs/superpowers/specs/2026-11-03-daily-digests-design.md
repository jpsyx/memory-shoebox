# Daily email digests

Status: proposed written spec, following approval of the in-chat design.

## 1. Intent and scope

Members should be able to follow family activity without receiving an email for
every event. Add daily digests for uploads, comments/replies, and comment tags.
Each category offers Off, Immediate, or Daily digest. There is no weekly digest.

| Category             | New-member default | Existing-member migration |
| -------------------- | ------------------ | ------------------------- |
| New photos/videos    | Daily digest       | Reset to Daily digest     |
| Comments and replies | Daily digest       | Reset to Daily digest     |
| Comment tags         | Immediate          | Reset to Immediate        |

The reset includes members who previously disabled these notifications. This is
explicitly requested, not an attempt to preserve their old choices. It runs once;
subsequent restarts preserve later user choices. Include pending invitations and
inactive members in the stored reset, but only eligible active members receive mail.

The approved delivery schedule is one combined email at 9 a.m. in the configured
Shoebox timezone, covering the previous calendar day. Send nothing on empty days.
This spec makes the following implementation policies explicit for review:
pending-event preference changes, outage catch-up, migration of unsent emails,
and safe retry behavior.

Removal preferences and their existing weekly reminders remain unchanged.
Sign-in codes, invitations, removal messages, and reactions retain their existing
behavior. No per-member timezone, selectable send time, weekly frequency, push
notifications, new external scheduler, or production deployment is included.

## 2. Existing implementation and chosen approach

The account API currently exposes five boolean notification preferences. Uploads,
comments, replies, tags, and removals each have their own switch. Comments and
replies already share the `comment` email kind but use different recipient
relationships. Their audience remains the uploader and existing participants
who can see the item, excluding the author.

The server queues upload mail when the session settles. Comment/tag scheduling
is transactional with comment changes. Explicit tag mail takes precedence over
ordinary comment mail on creation, and a durable tag ledger prevents repeated
notifications for removing and re-adding a tag. The existing outbox handles
provider suppression, retries, sender snapshots, and delivery history, driven by
a ten-second job.

| Approach                                                  | Assessment                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Dedicated pending digest events, then the existing outbox | Selected: source references and aggregation state are distinct from provider delivery state.         |
| Aggregate individual outbox rows                          | Rejected: overloads delivery records with pending activity and complicates cancellation and retries. |

Keep recipient selection in the feature modules. A shared activity-notification
scheduler sends immediate messages to the existing outbox or records a digest
event, according to the member's preference. The digest job uses those events to
prepare one message per member and send date. Do not reconstruct recipients from
a scan of historical activity.

## 3. Account settings and HTTP contract

Show three clearly labeled controls in the Email sheet: New photos/videos,
Comments and replies, and Comment tags. Each offers Off, Immediate, and Daily
digest. Replace the two existing comment/reply rows with one combined control.
Retain the removal on/off control and the sign-in-code explanation.

Use shared enum values `off`, `immediate`, and `daily` for `onUpload`, `onComment`,
and `onCommentTag`; `onComment` now covers both existing comment relationships.
Remove `onReply` from the current contract. Keep `onRemoval` boolean. Both the
read DTO and account update schema must match these semantics.

This is a coordinated web/server contract change. Reject legacy boolean writes
to the three frequency fields and obsolete `onReply` writes with validation
errors; do not silently convert an old client's whole-form save into new settings.
The account error message should tell a stale client to reload. A new client
continues to reconcile saved server state and serialize rapid edits as today.

Changes save immediately with the current saving and error treatment. Preserve
keyboard access and focus when the sheet is opened from a tag email. Explain
that Daily digest arrives around 9 a.m. in the Shoebox timezone, and show that
timezone. Immediate means delivery through the existing mail queue, not a promise
of zero latency. Turning all notifications off sets the three modes to `off` and
removals to false. Turning them back on restores the new frequency defaults and
the existing enabled removal behavior.

## 4. Storage and migration

Add a new numbered, append-only migration after `0021_comment_tags` and register
it with the existing migration runner. It must update schema types, the schema
manifest, constraints, and populated-upgrade fixtures together.

Store three authoritative frequency columns on `members` with constrained text
values and the new database defaults. Retire the old upload/comment/reply/tag
boolean columns from runtime reads and writes. The migration may retain those
columns as inert historical storage to avoid an unnecessary members-table rebuild;
they must not become a second preference authority. Preserve `notify_on_removal`.
Member creation paths, including setup and invitations, use the new defaults.

Add `notification_digest_events` containing a unique event ID, recipient member
ID, category, source kind/ID, occurrence timestamp, a durable deduplication key,
and lifecycle state. Lifecycle states are pending, included, or cancelled.
Included events reference their digest batch. Store source references rather
than rendered bodies or private media URLs. Index pending selection by recipient
and occurrence time, and index sources for cancellation. Maintain foreign-key
integrity without making source deletion erase delivery history.

Add `notification_digest_batches` containing the recipient, local send date,
timezone and cutoff snapshot, prepared timestamp, and outbox message ID. Enforce
uniqueness on recipient plus local send date. Add `daily_digest` to the outbox's
allowed kinds and to the typed email template/payload registry. The migration
runner owns transactions, backups, and integrity checks; migrations do not send
mail or call external services.

For existing outbox rows, leave all sent, terminal, and `sending` records alone.
Move never-attempted queued upload and ordinary-comment notifications into pending
digest events and cancel their individual rows in the same migration. Preserve
their original occurrence timestamps and recipient eligibility, with no duplicate
event per source/recipient. Leave queued comment-tag notifications immediate.
Already-attempted queued messages retain their original payload, identity, and
retry behavior: the provider might have accepted an earlier attempt. They do not
also become digest events. Failed historical rows do not create a retrospective
digest. Base-URL recovery for the three activity kinds must pass through the new
preference routing without duplicating events; an already-attempted row keeps
its existing delivery identity.

Migration completion does not imply production users have already changed. The
one-time reset takes effect when the updated application runs its migration
against that catalog. Publishing or deploying remains a separate action.

## 5. Event scheduling and preference changes

Schedule within the originating transaction: an upload session settles, a comment
is created, or a tag recipient first becomes eligible. Off records no notification.
Immediate queues the current individual email. Daily records a pending digest event.
Uploads still generate one event per batch and recipient, not one per media item.

Preserve current recipients, visibility rules, self-notification exclusions, and
tag-ledger behavior. When tag notifications are enabled in either delivery mode,
the tag event replaces the generic comment event for that recipient on creation.
When tag notifications are off, the ordinary comment preference still applies if
the member is an uploader or conversation participant. Generic mail sent earlier
does not block a first tag notification added by a later edit. Repeated tag edits
must not recreate an event already recorded by the lifetime ledger.

Preference changes apply immediately to future events. Turning a category Off
also cancels its pending digest events; turning it back on never resurrects them.
Changing Daily to Immediate cancels pending digest events for that category and
does not burst-send old activity. Changing Immediate to Daily does not create
digests from already queued immediate messages. The settings copy explains that
frequency changes apply to new activity and can discard an unsent summary.

Deleting a comment cancels its pending generic and tag events, including replies
removed by cascading deletion. Removing a tag cancels the relevant pending tag
event. Losing item visibility, inactive membership, or loss of tag eligibility
is checked again during digest preparation and delivery.

## 6. Daily scheduling, aggregation, and content

Use a job in the existing Fastify job registry, running once per minute. At or
after 09:00 local time, a recipient with pending activity before the start of
the current local calendar day is eligible. Calculate boundaries with the
repository's timezone helpers, not by subtracting 24 hours. Today's activity
waits for tomorrow. Job ticks before 09:00 prepare nothing.

The usual window is yesterday. After downtime or an upgrade with older pending
events, combine all overdue activity into that recipient's next digest. Label
the actual date range; do not emit one catch-up email per missed day. Repeated
ticks, restarts, and concurrent calls must not create another batch for the same
recipient and local send date. If a batch is already prepared, later eligible
events wait for the next send date.

Use the current Shoebox timezone when preparing a batch. Events retain UTC
occurrence timestamps; no timezone-specific daily buckets are stored on them.
A prepared batch retains its timezone, cutoff, and local send date even if the
instance timezone later changes. Pending events use the new timezone on the
next eligible run. A timezone edit can therefore change the interval to the next
digest, but never re-includes events from an earlier batch. During normal
operation this is one email per member per local date; delayed provider delivery
can cause multiple previously scheduled messages to arrive on the same day.

In one short database transaction, reserve the unique batch, select eligible
pending events, rebuild safe summaries from current sources, enqueue the digest,
and mark its events included. Invalid sources become cancelled. If no content
survives, do not enqueue an empty email or reserve a batch that blocks later
eligible activity that day. Database failure rolls the entire operation back.
No provider calls occur inside this transaction.

The email has sections for New photos/videos, Comments and replies, and Comment
tags, omitting empty sections. Group upload batches by uploader where useful,
with counts based only on currently visible surviving items. Group ordinary
comments by item; include author labels and short plain-text excerpts. Tags
link to the specific comment. All destinations use authenticated application
links, not signed media URLs. Do not include image attachments or hidden totals.

Bound the email to 20 source entries per category with comment excerpts of at
most 200 characters. Include accurate accessible totals, and a link to open the
Shoebox for additional activity. Events summarized in those totals count as
included; overflow must not become another day's artificial backlog. HTML and
plain-text versions contain the same information and a preferences link.

## 7. Delivery, privacy, and retries

Deliver prepared digests through the existing outbox, provider suppression, rate
limiting, sender snapshot, and retry mechanisms. Use a stable per-batch
idempotency key. Missing configuration follows existing queue-health behavior;
preparation never claims that an email was delivered. The digest job creates no
second outbox record for an existing batch, including failed batches.

Recheck eligibility immediately before the first provider handoff. If pending
content has become ineligible, regenerate the not-yet-attempted digest from its
remaining eligible events and cancel an empty result. Check current membership,
category not Off, item visibility, source existence, and current tag presence.
Switching Daily to Immediate may leave an already prepared digest deliverable;
the cancellation rule in section 5 applies to events still pending preparation.

After an actual provider attempt, freeze the message body as well as the sender
and reuse its idempotency key on retry. Never change content under the same
provider key. If a retry would disclose content that is now inaccessible, deleted,
untagged, or explicitly opted out, cancel that digest instead of resending or
repackaging it. Keep this conservative cancellation visible in delivery history.
Ordinary text edits alone do not rewrite an already-attempted snapshot. A message
already accepted by the provider cannot be recalled.

The existing outbox policy for a process dying with a row in `sending` remains
unchanged. This feature does not add a general mail reaper or promise exactly-once
delivery across an ambiguous provider outcome.

## 8. Components and documentation

| Area                                         | Responsibility                                                    |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `packages/shared`                            | Frequency enums, account contract, digest payload schema          |
| `apps/server/src/db`                         | Migration, event/batch tables, types, manifests                   |
| `apps/server/src/members` and account routes | Read/save preferences, cancel pending opt-outs                    |
| Upload and comment/tag modules               | Existing recipient selection, new delivery-mode routing           |
| `apps/server/src/mail` and `jobs`            | Digest preparation, eligibility, stable retries, job registration |
| `packages/emails`                            | Combined digest template, text rendering, registry                |
| `apps/web/src/surfaces/Account`              | Three frequency controls, timezone/help copy, validation errors   |

Update `docs/PRODUCT.md`, `docs/mail.md`, `docs/emails.md`, `docs/web.md`,
`docs/migrations.md`, and relevant shared/API/data-model documentation in the
same implementation. Explain the reset and delayed delivery without claiming
production rollout. Keep the implementation scoped to this feature.

## 9. Verification and completion criteria

Use red/green tests for behavior before implementation. Test locally with fake
or recording email services; do not send real emails or mutate production data.

1. Populated migration resets every member class, preserves removal preferences
   and delivery history, converts only safe unsent rows, validates constraints
   and foreign keys, and is not reapplied on restart.
2. Fresh member/setup/invitation creation gets the correct defaults. API schemas
   validate each mode and reject obsolete writes without overwriting preferences.
3. Each event category obeys Off/Immediate/Daily, preserves audiences, and
   deduplicates upload retries and tag/comment overlap across mixed modes.
4. Scheduling covers 08:59 versus 09:00, local midnight boundaries, both DST
   transitions, timezone edits, empty days, multiple missed days, concurrency,
   transaction failure, and a previously prepared batch.
5. Preference edits, removed members/tags, deleted parents/replies, and changed
   visibility affect pending and prepared digests as specified. Hidden media
   never contributes counts, excerpts, or destinations.
6. Provider failures preserve body/sender identity and idempotency; suppression,
   missing configuration, and unsafe retries produce the correct terminal or
   deferred states without another digest.
7. HTML/plain text cover all category combinations, truncation, special
   characters, accessible totals, preferences links, and empty-content omission.
8. Account tests cover persistence after reload, save failures, rapid changes,
   bulk buttons, tag-link focus, and keyboard/mobile usability.

Run focused tests first, then repository formatting checks, lint, type-check,
build, and tests appropriate to the cross-package change. Inspect rendered email
and settings surfaces locally. Record exact results in the implementation
handoff. A reviewed spec alone does not complete the feature.

## 10. Workflow handoff

The in-chat design is approved. This written spec needs review before the
superpowers writing-plans stage. After written-spec approval, write the
implementation plan and obtain its required execution-method selection. Product
code and database migrations have not been changed at this stage.
