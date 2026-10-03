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

Picker, mismatch pagination, and reconciliation endpoints are subsequent
backend slices. Global timeline band assignment already uses the pure helper
in `src/milestones/getDayBandAssignmentsFromMilestoneSpans.ts`.
