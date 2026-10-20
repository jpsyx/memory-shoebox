# Item media reads

The item permalink composes the selected item and its visible burst siblings
from one rendition batch. The selected item receives `selected-view` media;
every sibling receives `thumbnail` media. The batch chooses eligibility before
signing and retains the B2 lease's actual issuance and expiry.

A photo has nullable image sources and explicit display candidates. A video has
a separate nullable `playback` source carrying its actual MIME type. Optimized
MP4 playback is preferred, then WebM. An original video is available only as a
selected-view fallback, never as a thumbnail, display image or speculative
source. Original-download authorization remains the existing separate action.

Catalog width and height preserve oriented layout even when every rendition is
missing. The item still answers successfully, and burst frames retain their
dense visible positions with nullable thumbnails. A missing preview is
`unavailable` until durable processing can truthfully mark it `pending`.
The same accessible placeholder is used across the browser's media surfaces.

See [archive.md](archive.md#explicit-media-availability) for preview eligibility,
[the item API](prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md) for item
behavior and authorization, and [web.md](web.md) for the viewer and conversation
surfaces. This representation change preserves actual-open and seen tracking;
processing jobs are separate from these reads.

## Media-only previews and neighbors

Authenticated `POST /api/media/preview` reads at most eight requested IDs, with
`speculative-preview` or `selected-view` source selection. IDs are validated before
catalog reads, deduplicated in requested order, and hidden or missing IDs are
omitted identically. All media metadata endpoints send `Cache-Control: no-store` and
use the normal authenticated route rate limit.

`POST /api/media/neighbors` accepts the current item, shared `TimelineSelection`,
and a direction. It returns at most two `ahead` previews and one `behind`, closest
first. The selection preserves tag, people, date, and milestone attachment
filters; callers pass the effective `until` boundary of a timeline jump. A
missing, hidden, deleted, or no-longer-matching current item returns empty lists.

Navigation keeps newest days first and newest captures first within each day,
with descending sequence breaking capture-time ties, matching the timeline. A burst occupies its earliest visible,
matching capture; its cover does not determine its position. Frames follow burst
index then ID, with null indices last. Forward entry selects the first matching
frame and backward entry the last, using bounded SQL probes. No navigation read
fetches a whole timeline day or burst strip.

These reads neither count opens, latch seen state, nor enqueue mail. Payloads
carry media and layout only, without comments or mutation authority. Selected
renewal may return original-video playback as the existing fallback; neighbor
reads and speculative batches never return original-video playback. Actual item
reads and their failure retry behavior remain separate.

## Authorized theater position

Authenticated `POST /api/media/position` accepts `{ itemId, selection }` with
exactly the same `TimelineSelection` as neighbors, including effective jump
boundaries. It returns `{ position, total }` with a dense one-based position
among visible matching photos and videos, expanding every matching burst frame.
Hidden, missing, deleted and out-of-selection current items return `null`,
without exposing a total. The response uses `Cache-Control: no-store` and the
normal authenticated rate limit.

A single SQL selection and window query computes group anchors, total and rank
in one snapshot. It uses the same earliest visible matching burst capture and
capture/sequence/ID tie breaks as neighbors, then ascending burst index with
nulls last and ID ties. It does not materialize archive rows in JavaScript or
change the bounded neighbor query. This read creates no opens, seen state,
activity events, email or storage signing work.

The browser scopes the query to member and selection, retains freshness for
30 seconds, and disables retries and focus refetch. The theater enables it
only after matching actual-detail authorization. A missing or refused counter
omits that segment from the title; title copy continues to use `itemHeading`
and the existing camera-offset/instance-timezone wall-clock rules.

## Browser consumption

The member-scoped preview store is media-only. Timeline prints and burst frames
seed known thumbnails, and pointer, focus and touch intent may request a safe
preview. Selected preview pixels can appear while ordinary detail is pending,
but comments and writes use only actual-detail authorization. Refusals remove
the pending media from view without changing open-count or retry semantics.

The viewer and neighbor scheduler share one viewport/DPR candidate selector,
including portrait fit, supported image formats and actual rendition byte sizes.
The selected thumbnail remains until the exact responsive image decodes. A
navigation lease is acquired before old-route cleanup and transferred to the
same item, rendition and URL. Member retirement, abandoned navigation and view
exit release all app ownership while unavoidable native transfers remain charged
to the scheduler until settlement.

Known neighbor identities come from fresh, non-invalidated query data for the
same member and canonical selection, including the originating jump's effective
until. A contiguous retained page window or previously read neighborhood must
prove every required identity; a collapsed burst cover never proves its edge.
Missing or stale media alone renews through the safe preview endpoint. Unknown
ordering, page gaps, expired metadata or an omitted renewed item uses the safe
neighbor endpoint. Deriving another query result preserves the original metadata
timestamp and cannot extend its authority. Each retained timeline page carries
its own request-start timestamp. Reuse takes the oldest contributing page,
including empty pages that establish continuity or an archive boundary; adding
a page cannot renew earlier identities. Missing page provenance falls back to
the neighbor endpoint. No additional neighborhood cache is maintained.

Same-rendition navigation replacement acquires its new scheduler lease before
releasing the pending one. The selected video's measured viewport is published
to navigation and follows resize/DPR changes, so its warmed photo candidate is
the exact source promoted and adopted by the incoming viewer.

Browser acceptance before the rendition-purpose migration uses the existing
thumbnail/display purposes, including a separate optional portrait fixture.
It verifies matching `currentSrc` and zero repeated media bodies at DPR 1 and 2
in Chromium and WebKit. The full published 480/960/2048 candidate set and
optimized-video metadata remain later M2 evidence gates.

## Theater presentation

Photo entry and the video toolbar's Enter theater action select one shared
presentation on the existing item route. The persistent host owns fullscreen
and modal focus/scroll across mixed navigation and failed actual-detail reads.
Back returns to the current item and re-entry retains that selection. Existing
heading/capture-clock copy supplies the single-line title; no new title field or
accessibility-description override was introduced. The authorized position above
is ancillary and never gates selected media. Conversation writes, leases and
navigation ownership remain shared. See [theater](theater.md) and its
[verification](theater-verification.md).
