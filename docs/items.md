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
omitted identically. Both preview endpoints send `Cache-Control: no-store` and
use the normal authenticated route rate limit.

`POST /api/media/neighbors` accepts the current item, shared `TimelineSelection`,
and a direction. It returns at most two `ahead` previews and one `behind`, closest
first. The selection preserves tag, people, date, and milestone attachment
filters; callers pass the effective `until` boundary of a timeline jump. A
missing, hidden, deleted, or no-longer-matching current item returns empty lists.

Navigation keeps newest days first and oldest captures first within each day,
with sequence breaking capture-time ties. A burst occupies its earliest visible,
matching capture; its cover does not determine its position. Frames follow burst
index then ID, with null indices last. Forward entry selects the first matching
frame and backward entry the last, using bounded SQL probes. No navigation read
fetches a whole timeline day or burst strip.

These reads neither count opens, latch seen state, nor enqueue mail. Payloads
carry media and layout only, without comments or mutation authority. Selected
renewal may return original-video playback as the existing fallback; neighbor
reads and speculative batches never return original-video playback. Actual item
reads and their failure retry behavior remain separate.

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

Browser acceptance before the rendition-purpose migration uses the existing
thumbnail/display purposes, including a separate optional portrait fixture.
It verifies matching `currentSrc` and zero repeated media bodies at DPR 1 and 2
in Chromium and WebKit. The full published 480/960/2048 candidate set and
optimized-video metadata remain later M2 evidence gates.
