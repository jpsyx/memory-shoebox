# Milestones

A milestone names an occasion with an inclusive calendar-day span. Every member
sees every occasion, including empty ones. Its attachment and mismatch counts
include only items the current viewer may open; people tags never grant access.
Uploader and admin roles can change any milestone, regardless of its nullable
creator. Shared schemas define the HTTP contract and trim names (up to 200
characters) and blurbs (up to 280, with blank stored as null).

## Routes

All routes require a session and live under `/api`.

| Method | Path                             | Role           | Result                                               |
| ------ | -------------------------------- | -------------- | ---------------------------------------------------- |
| GET    | `/milestones`                    | Member         | List with per-viewer counts and an optional cursor   |
| POST   | `/milestones`                    | Uploader/admin | 201 detail, optionally attaching a selection         |
| GET    | `/milestones/:milestoneId`       | Member         | Detail, creator metadata, and visible mismatch count |
| PATCH  | `/milestones/:milestoneId`       | Uploader/admin | Detail after merging supplied fields                 |
| DELETE | `/milestones/:milestoneId`       | Uploader/admin | Deleted occasion and visible detached item count     |
| PATCH  | `/milestones/:milestoneId/items` | Uploader/admin | Detail and actual attachment/detachment counts       |

The list sorts by start day descending, then ID descending. Its opaque cursor
validates both fields. Optional `from` and `to` select overlapping spans, not
occasions wholly contained by those bounds. The default page holds 50 rows,
with a maximum of 200. Counts are one batched visible-item aggregate for all
rows on the page; detail uses three fixed reads for metadata, attachments, and
unacknowledged outside-span attachments, regardless of attachment count.

## Mutations and dates

All mutation reads, writes, audit events, and response reads share a
`BEGIN IMMEDIATE` transaction. Create stores the supplied dates unchanged and
allows duplicate names and out-of-span attachments. It validates the complete
selection before any writes and records attachment actor/time with a null
acknowledgement. Optional selections and each attachment direction cap at 500.

PATCH validates the complete span after merging partial fields. A real change
to either date clears every attachment's mismatch acknowledgement, including
hidden attachments. Repeating the stored dates, renaming, or changing the blurb
preserves acknowledgements. Span edits never move items or write capture history.

Attachment PATCH is a delta: omitted joins remain. Attach and detach IDs must
be unique within each list and disjoint across lists. Empty deltas fail
validation. One visibility-filtered read validates their union before writes;
inaccessible and nonexistent items return identical `item_not_found` responses
and reject the entire change. Duplicate attach preserves actor, attachment time,
and acknowledgement; duplicate detach is a no-op. Neither changes item or burst
facts. Counts report actual changes, rather than submitted list lengths.

Deleting an occasion cascades its joins only. Photos, bursts, renditions, and
object-deletion queues are untouched. The response's `detachedItemCount` is
per viewer. One `milestone_deleted` activity snapshots the actor, device,
occasion name, span, and true count in `detail.attachmentCount`; the activity
is for the admin audit log.

Global timeline band assignment uses the pure helper
in `src/milestones/getDayBandAssignmentsFromMilestoneSpans/getDayBandAssignmentsFromMilestoneSpans.ts`.

## Attachment picker and mismatches

Uploader/admin GET `/milestones/:milestoneId/candidates` defaults to the stored
inclusive span, with a 60-item page and maximum 200. `scope=all` accepts optional
inclusive `from` and `to`; the default span scope rejects those bounds.
Candidates carry complete item summaries, `isAttached` from the existing join,
and advisory `isOutsideSpan`. Outside-span items may still be attached.

Uploader/admin GET `/milestones/:milestoneId/mismatches` returns visible, attached,
unacknowledged items whose capture day falls outside the occasion. Its default
page is 50 items, maximum 200. Each row includes its attachment timestamp. The
response's `wideningSpan` aggregates every matching row, independently of the
page limit and cursor, and never shrinks the stored span. Hidden, acknowledged,
and inside-span attachments affect neither that aggregate nor mismatch rows.
An occasion without pending mismatches returns its current span.

Both reads order by capture day descending and item ID descending. Opaque
cursors validate both fields and use the last selected row, including when a
missing rendition caused that row to be skipped and logged. Such a defect can
produce a short or empty page with a non-null cursor. Following it advances
past the defective row rather than retrying it indefinitely.

The shared item-ID summary reader retains each requested item identity, even
when it belongs to a burst. It batches visibility, seen state, renditions,
people, uploader references, and visibility summaries. One sibling read covers
all involved bursts; metadata counts and spans use the complete visible sibling
set, including frames beyond the page. A hidden cover falls back to the earliest
visible frame, and a burst with one visible frame has null metadata. The helper
returns only existing visible items with drawable media, using the archive's
rendition fallbacks and alt-text composition. Query counts remain fixed as item
and burst counts grow.

## Reconciliation

POST `/milestones/:milestoneId/reconcile` accepts uploader/admin batches of up to
500 unique items in `move` or `acknowledge` mode. One visibility-filtered item
read checks the entire selection and its attachment membership before changes.
An invisible or nonexistent item yields the same `item_not_found`; a visible
unattached item yields `milestone_attachment_missing` (409). Move targets must
fall inside the stored span, with dotted per-item errors such as
`moves.3.targetOn`. All validation, changes, and response reads share one
immediate transaction.

Acknowledgement writes only null timestamps, preserving the first decision and
reporting only newly acknowledged joins. It writes no item or capture history.
Move uses `items/setItemCaptureDates.ts`, the same service as singular manual
corrections. It plans every clock before writing: recorded offsets stay fixed;
unknown offsets stay null and use Shoebox timezone rules across DST. Original
capture instants remain untouched. Actual moves get `uploader_set` capture
source and one history row with `milestone_reconcile` reason and this milestone
ID. An already-correct day with no explicit clock is a no-op and produces no
history, preserving the exact instant (including DST occurrence and subsecond
precision), source, offset, original capture facts, and burst membership.
Explicit manual clock corrections still use local clock conversion.

Changed frames leave bursts whose day they no longer share. Only bursts with no
remaining items are deleted, including invisible siblings in that storage
check; surviving indexes are preserved. Moves clear acknowledgements on attached
occasions that now exclude the item. `raisedElsewhere` reports those other
occasions, ordered by span start and ID descending, with their full visible
unacknowledged mismatch counts. Unchanged items raise nothing elsewhere.

Clock planning happens in memory; item updates use bound CASE parameters, audit
inserts are multi-row, and burst ejection, empty checks, acknowledgement clearing,
and raised mismatch counts run in batches. Settings are fetched once per move
batch. Query counts do not grow with items, bursts, or affected occasions.

## Web list and forms

`/milestones` is a member-scoped directory with wrapping rows, cursor
continuation and duplicate-ID suppression. Every member can read names, inclusive
spans and the server's visible item count, including zero. The creation control
is available to uploaders and admins; existing edits, attachment entry points
and deletion use each returned row/detail capability. A null creator needs no
member lookup.

Validated `milestone` and `mode` search parameters retain the selected occasion
and step through refresh and browser Back. Invalid IDs, unknown modes and modes
without their required ID render a safe address error before any write mounts.
The supported modes are `create`, `created`, `edit`, `attach`, `fix`, `empty` and
`delete`. Creation has no ID; every other mode requires one. The `created` view suggests individual photographs from the saved span; `attach`
uses the archive filters to edit attachment deltas. The `fix` view provides the
stored-state extension seam for reconciliation.

The form uses the shared one-day/span fields. A day submits equal inclusive
ends, spans need both ordered ends, and an optional blank blurb submits null.
Names accept 200 characters and blurbs 280. An existing explicit caller may
supply landed item IDs and available capture days; those days seed the form
once and never replace later edits. There is no new timeline selection flow.
Confirmed creation enters `created`; cancelling that saved step retains the
occasion. A confirmed edit enters `fix` when the response reports mismatches,
and otherwise returns to the directory.

Failed submissions retain words. Mutation retry is disabled, immediate guards
block rapid duplicate presses, and a transport or response-schema failure
blocks resubmission. An uncertain create cannot be identified by name because
names may repeat. The member must return to the list and inspect an authoritative
refresh before starting another explicit change. Failed list refreshes withhold
the creation control. A failed background detail read keeps the edit form's words
and uncertainty mounted, reports the read failure beside it and blocks saving
until a current permission read succeeds. An uncertain write remains blocked
until the member reviews the list even after that read recovers. A known save
response determines the next address before cache refresh begins, so a failed or
slow refresh cannot discard confirmed list/fix navigation. Mounted member/occasion
ownership prevents late answers from navigating a different view.

The empty view uses the stored span and visible count in a real `MilestoneBand`;
it offers attachment only to an allowed editor and has no fixture contact action.
Deletion confirms that only the label and joins disappear. It sends only
milestone DELETE and announces the returned name and visible detached count
before refreshing reads, so a subsequent detail 404 cannot lose the confirmation.
A refused or uncertain deletion requires an authoritative detail refresh before
another attempt. An inaccessible refresh keeps the outcome unconfirmed.

`invalidateMilestoneReads` refreshes active member-scoped directory, selected
detail, candidate and mismatch reads plus timeline/rail data. Item IDs supplied
by attachment or movement callers become stale with `refetchType: "none"`:
item GET records an open, so invalidation never refetches a detail automatically.
Movement also invalidates bursts. Label deletion retains item and burst caches
and media.

## Web attachment choices

`MilestoneCandidates` reads paged span candidates and uses each `isAttached`
baseline. `MilestoneAttach` reads independently paged attached and available
archive branches with the same tags, people and inclusive capture-date bounds.
`FilterSheet` retains the existing vocabulary typeahead: typed words request
`/tags` and `/people` with `q`; timeline reads never receive `q`. Picker reads,
facets and vocabularies include member identity in their cache keys, while
ordinary filter callers keep their existing keys.

Both modes combine explicit returned item identities in capture-day order and
suppress duplicate rows. A collapsed burst's pressed representative selects
only its returned item ID, never its cover or inferred siblings. Itemless
occasion bands provide no selectable identity. Empty pages with continuation
cursors remain pageable; pending reads are announced and failed current reads
can be retried without losing choices. Selecting prints invokes neither item-open nor seen
endpoints.

The owning hook retains first-observed baselines and explicit choices across
filter changes, background reads and failures. Only changed, observed IDs enter
`attach` or `detach`; unseen and filtered-away attachments are never removed
implicitly. Each direction caps at 500 before a request, preserving choices on
refusal. A no-change save makes no PATCH. Confirmed responses show the actual
attached/detached counts and offer date fixing for pending mismatches. Cancel
leaves the saved occasion intact and discards only local choices.

Save refreshes occasion authority and blocks duplicate writes immediately.
A failed background selected-detail read retains the active picker and disables
Save until current authority is restored. After an uncertain PATCH, the next
deliberate Save reads current detail and paginated unfiltered `scope=all`
candidates until every pending explicit ID is verified. It includes the original
unconfirmed operation's IDs even when later toggles cancel the old delta. Only
this recovery recalculates pending choices against current `isAttached`, so
already-applied changes disappear and changed intent can reverse them. Missing
or inaccessible identities and repeated recovery cursors block the write;
absence never implies detachment. No retry runs automatically, and a lost
response's delta counts are never invented. This can require extra reads or
keep saving blocked until access to a chosen photograph returns.

After asynchronous recovery, Save checks the current member-scoped detail query
again immediately before writing. A failed or active background detail read
blocks the write even when cached capabilities still permit editing. The save's
own completed detail preflight supplies usable authority.

A failed picker thumbnail becomes an unavailable photograph button, preserving
the returned identity and explicit choice without displaying a broken image.
This also applies to entries retained after a failed candidate read. A refreshed
thumbnail URL can be read again.
