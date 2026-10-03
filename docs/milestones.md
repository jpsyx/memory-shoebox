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
in `src/milestones/getDayBandAssignmentsFromMilestoneSpans.ts`.

## Attachment picker and mismatches

Member-visible GET `/milestones/:milestoneId/candidates` defaults to the stored
inclusive span, with a 60-item page and maximum 200. `scope=all` accepts optional
inclusive `from` and `to`; the default span scope rejects those bounds.
Candidates carry complete item summaries, `isAttached` from the existing join,
and advisory `isOutsideSpan`. Outside-span items may still be attached.

GET `/milestones/:milestoneId/mismatches` returns visible, attached,
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
ID. An already-correct target is a no-op and produces no history.

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
