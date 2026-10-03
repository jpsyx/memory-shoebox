# Step 7a: milestones and removals

Date: 2026-10-03
Status: proposed for review
Source: `docs/prds/2026-09-27-memory-shoebox/plan/step-7a.md`

## Intent and scope

An uploader or admin can name a dated occasion, find its photographs, attach
and detach them, and reconcile their dates. A member tagged in a visible
photograph can ask for it to come down. The uploader and admins hear about the
ask and receive weekly reminders until deletion, decline, or withdrawal closes
it. The person who asked receives the answer, including the decliner's own
words. This implements the backend and all five removal emails only.

The product spec and prototype surfaces remain read-only references. No new
frontend surface, request-history screen, scheduler state, expiry, escalation,
accept route, member-management functionality, or deployment is included.

The API slice documents, their rulings, the shared conventions, and existing
schema determine the behavior. Implementation uses red/green TDD, existing
Fastify request context, Kysely transactions, the visibility predicate, archive
media readers, the item deletion service, and the typed mail queue.

## Approach

| Approach                                                      | Tradeoff                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extend the existing services and transaction seams (selected) | Reuses the tested visibility, clock arithmetic, media resolution, and deletion behavior; requires narrowly scoped edits in the item and archive slices. |
| Implement independent milestone and removal stacks            | Easier initial isolation, but duplicates authorization and capture-date behavior and risks disagreement with existing capabilities.                     |
| Introduce a generic workflow or notification framework        | Adds abstractions and migration work that these two small slices do not require.                                                                        |

No migration is expected: milestone joins, capture-date history, request
snapshots, partial uniqueness, and request state checks already exist. Confirm
those invariants against the migrations before implementation.

## Contract and boundaries

Add erasable Zod schemas and inferred types in `packages/shared/src/milestones.ts`
and `packages/shared/src/removals.ts`, exported from the shared entry point.
Add the three removal mail payload schemas to the existing email contract,
with `removal_resolved` discriminated into deleted, declined, and withdrawn.
The request and response names follow the API documents. Existing frozen DTOs
remain composed rather than widened.

Milestone contracts include summary, detail, candidate, mismatch, nine route
request/response pairs, and the resolved band shapes where not already present.
Removal contracts include `RemovalRequestDto`, five route request/response
pairs, and per-viewer `canWithdraw`, `canDecline`, and `canDeleteItem`.

Use shared limits: milestone names are trimmed, nonempty, and at most 200
characters (`LIMITS.milestoneNameMaxLength`); blurb is trimmed, at most 280,
and blank becomes null. Removal reason and decline reason are trimmed before
the common 4000-character cap; blank ask reason becomes null, while blank
decline reason is a field error. Calendar dates must be real `YYYY-MM-DD`
dates, not merely matching strings. Milestone batches cap at 500 per list.
Duplicate IDs and overlapping attach/detach lists are validation failures.

Routes are thin handlers under `apps/server/src/routes/`, registered in
`createApp.ts`. Focused services live under `milestones/` and `removals/`.
All mutation reads and writes occur in one transaction, including the response
read and the mail enqueues. Validation produces `invalid_request` with field
errors, including merged span failures and dotted move-target paths.

## Milestones

Implement all nine routes in `apis/milestones.md`. Every member sees every
milestone. Only uploader/admin roles mutate or use the picker and mismatch
routes; permission never depends on `created_by`.

List rows sort by `(starts_on DESC, id DESC)` with a validated opaque pair
cursor, default limit 50 and maximum 200. Optional from/to filters select
spans overlapping the supplied bounds. Counts are one batched visible-item
aggregate for the returned IDs, with missing groups read as zero. Details add
visible unacknowledged mismatches and nullable creator metadata.

Create returns 201, uses the supplied span unchanged, and optionally attaches
up to 500 visible items, including items outside the span. Validate all selected
items in one visibility-filtered read before inserting. Attachment metadata
records the actor and timestamp, with null acknowledgement.

PATCH merges supplied fields with the stored row before span validation. Only
actual date changes clear all acknowledgement timestamps for that milestone.
Renaming or changing the blurb leaves them alone. Updating a span never changes
an item or writes capture-date history.

PATCH items applies a delta. Validate visibility for the union of attach and
detach IDs before any writes. Insert attachments with conflict-do-nothing;
delete only explicitly named detachments. Return counts of actual changes.
Neither operation moves an item or changes a burst. Invisible and nonexistent
IDs yield the same `item_not_found`, with the entire mutation rolled back.

Candidates default to scope span, limit 60, maximum 200, sorting by capture day
then ID descending. Scope all accepts optional from/to; scope span rejects
those bounds. Reuse batched archive media and burst readers to return complete
ItemSummary values with isAttached and isOutsideSpan. Search by tag, person,
and text continues to use timeline's existing attachedToMilestoneId flag.

Mismatches default to limit 50, maximum 200, using the same capture-day/ID
cursor ordering. The predicate is visible, attached, outside the span, and
unacknowledged. WideningSpan aggregates every matching item, not only the page,
and is bounded by the current span even when no mismatch exists.

Reconcile validates all visible items and attachment membership before changes.
A missing attachment is `milestone_attachment_missing`; target dates outside
the span produce per-item field errors. Acknowledge sets only previously null
acknowledgements and preserves existing timestamps. Move requires a target day
for each item and calls the same clock-preserving machinery as manual capture
correction. Count only actual moves; an already-correct target is a no-op.

Extend the shared capture-date service to accept the history reason and
milestone ID, with manual callers keeping manual/null. Prepare the batch once
and apply item changes and history in batches in one transaction, avoiding
per-item visibility/settings/burst reads. Preserve original captured_at facts,
clock time, and stored offset; unknown offsets remain null and use Shoebox
local-time arithmetic across daylight-saving transitions. Changed items use
capture_source uploader_set and history reason milestone_reconcile.

Day-changing frames leave their burst. Delete emptied bursts based on all
remaining rows, including invisible siblings, and do not renumber survivors.
Clear acknowledgements on other attached milestones now excluding the item;
return those milestones and their visible mismatch counts as raisedElsewhere.

Deletion removes only the milestone and its joins. Compute the visible count
before deletion for detachedItemCount and the true count for the admin-only
milestone_deleted activity detail. No item, rendition, or queued object deletion
is created or removed by this route.

## Deterministic timeline bands

Step 7a specifies global band assignment, while the current archive code
carries opened IDs through its cursor. Replace that ranking dependency with
one shared pure function, `getDayBandAssignmentsFromMilestoneSpans`, whose name
follows repository naming rules. It accepts all milestone spans and returns a
map keyed by calendar day. Walk days newest first; choose the narrowest
unintroduced covering span, then earliest start, then smallest milestone ID.
Only winning a band introduces a milestone. Continuations sort by start and ID.

The timeline uses this assignment even when date or content filters omit the
day where a milestone opened. Assignment depends on neither viewer nor page;
counts remain per viewer. Query the complete, small milestone set for ranking,
while retaining the archive's bounded item-day and media work. New cursors
carry lastDay and filter digest only. Accept existing valid cursor envelopes
with legacy opened IDs but ignore that field for ranking. Keep the existing
HTTP timeline DTO field names used by the web app.

## Removal authorization and reads

Extract one shared removal gate from the existing item-detail query. The
people-tag EXISTS joins item_people through people.member_id. It is evaluated
only after an item passes visibility; it cannot grant access. Item capabilities,
item-scoped removal reads, and creation consume this gate.

The product and removals contract say any tagged member may ask, including a
tagged uploader or admin. Remove the current uploader-specific subtraction
from item capabilities so POST and the offered capability agree. The absence
of an existing open request controls canRequestRemoval; duplicate POST is still
handled by the partial unique constraint, yielding removal_already_requested.

Requests are visible to their requester, their snapshot uploader, and admins.
Request-ID routes apply that scope without rechecking item access; other people
receive byte-identical removal_request_not_found responses. The requester can
withdraw after access is narrowed, but receives media null. Never expose the
snapshot storage key. Resolve members and visible media in batches.

The queue is uploader/admin only, scoped to snapshot uploader for uploaders,
all rows for admins. State selects open or settled, default open. Pagination
sorts by ID descending, default 25, maximum 100. OpenCount and settledCount
share one grouped scoped query. Item-scoped GET first checks item visibility,
then returns only three-party rows, a complete ItemSummary, canRequestRemoval,
and a null nextCursor.

## Removal mutations

Creation reads snapshot uploader, capture instant, and original storage key
from the visible item. Insert the open row and enqueue the request messages in
the same transaction. Map only the relevant partial unique violation to 409.

Decline requires snapshot uploader/admin after three-party access. Withdrawal
requires the requester exclusively: uploader/admin access does not authorize
speaking for them. Use UPDATE WHERE state = open and require one changed row;
a second attempt yields removal_request_not_open. Set state, resolved_at,
and resolver together. Decline changes one request and requires own words;
withdrawal changes one request and takes no explanation.

Extend closeOpenRemovalRequests in the existing item deletion transaction:
close every open request and enqueue each request's deleted messages before
DELETE items nulls their item_id. Preserve already-settled rows and all existing
object cleanup. Do not add an accept endpoint or a prerequisite for deletion.

Database CHECKs enforce open iff unresolved and prohibit open requests without
items; conditional updates enforce that an already-settled request cannot be
settled again. The timestamp CHECK alone does not enforce transition history.

## Mail and reminders

Add request, reminder, and resolved templates in packages/emails, with five
bodies matching the prototype states and two forms per body. Register all three
kinds and their payload schemas in the server mail registry. Payloads snapshot
names, settings, calendar dates, instants, copy inputs, and URLs at enqueue.
Rendering performs no database queries.

| Message   | Active recipients                                                      | Preference and key                                                                           |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Request   | Snapshot uploader and every admin, excluding requester, deduplicated   | notify_on_removal; removal:requestId:memberId                                                |
| Reminder  | Same set, recomputed each run                                          | notify_on_removal; removal-reminder:requestId:memberId:weekIndex                             |
| Deleted   | Requester plus uploader when uploader differs from actor; deduplicated | Requester ignores notify_on_removal; uploader honors it; removal-resolved:requestId:memberId |
| Declined  | Requester                                                              | Ignores notify_on_removal; removal-resolved:requestId:memberId                               |
| Withdrawn | Snapshot uploader and admins, excluding actor                          | notify_on_removal; removal-resolved:requestId:memberId                                       |

The general actor-exclusion rule applies, including when requester deletes
their own upload. Provider address suppression remains unchanged. The requester's
answer has no misleading turn-these-emails-off footer; suppressible copies keep
the account link. Deleted mail has no item link. Decline quotes the actual words
first in HTML and text, followed by the hedged visibility sentence. Request mail
states nothing has happened; withdrawal states the photo is untouched. Use names
without inferred gender. Reminder age uses its weekIndex rather than saying
one week forever.

Give runRemovalReminder its real enqueue body. Inside one transaction, select
open requests and the current active recipient set, require weekIndex >= 1,
and enqueue with unique-key conflict-do-nothing. Retain the existing Shoebox
local-calendar week helper, whose boundary and DST behavior already have tests.
Do not store last-reminded state or catch up missed weeks. Resolution stops
future enqueues because the open predicate stops matching. Already-queued mail
keeps the queue's existing behavior.

## Verification and documentation

Write and observe failing tests before implementation for shared validation,
route authorization and privacy, milestone deltas, reconciliation and history,
removal state transitions, recipient sets, preference behavior, and reminder
idempotence. Use real migrated SQLite and Fastify injection as existing API
tests do, with fake storage and a controlled clock.

Cover invisible versus nonexistent errors, partial unique retries and ask-again,
admin/uploader withdrawal refusal, request access after visibility changes,
all-open deletion before SET NULL, constraint rejection, second resolution 409,
transaction rollback including mail, no photo deletion on milestone deletion,
invisible burst survivors, acknowledgement reset, full-set widening across
pages, fixed offsets and unknown-offset DST moves, global band tie breaks,
viewer/date/page independence, and legacy cursor handling.

Compare all five email subjects, rendered bodies, and plain-text bodies to the
prototype copy, including absent reason, multiline own words, relation variants,
HTML escaping, unsuppressible footer handling, and deleted mail without links.
Save rendered HTML for visual inspection before declaring copy complete.

Run targeted suites through each task and pnpm check at completion. Update
docs/server.md, docs/archive.md, docs/mail.md, docs/emails.md, and
docs/architecture.md for the new routes and behavior, and mark step 7a complete
only after its verification passes. Create focused milestone/removal overview
docs if needed. Keep product specs and prototypes unchanged.

## Decisions for review

1. Use the central 200-character milestone name limit instead of the slice's
   stale 120. This is already the shared contract limit; no migration needed.
2. Allow any visible tagged member to ask, matching PRODUCT and removals, and
   remove the existing extra uploader exclusion from capabilities.
3. Adopt the step's global band rule rather than the earlier archive design's
   carried cursor state, while accepting legacy cursors.
4. Retain the existing timezone-local calendar-week implementation of reminder
   age, matching notifications' local-boundary requirement.
5. Keep one design and implementation plan for both slices as step 7a requests;
   use separate focused implementation tasks and shared mail integration.

After written-design review, create the detailed implementation plan and execute
it with subagent-driven development, as the step explicitly requests. No merge,
push, PR, or publication is authorized.
