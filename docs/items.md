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
it does not introduce speculative endpoints or processing jobs.
