# Media loading, caching, and processing

Status: approved by Juan Pablo on 2026-10-14. Product implementation has not started.

## Outcome and agreed scope

Juan Pablo requested implementation of the media-performance audit's
recommendations. Reloading should reuse previously downloaded photos when
possible; moving between items should usually find the next photo ready;
videos should have economical playback copies; and long browsing sessions
should have bounded background work and memory use.

Keep the TanStack Router SPA, one Fastify deployment, private B2 storage,
original-quality archives, current visibility rules, and accurate open/seen
records. Media downloads continue directly from B2. Background derivative
processing is a new, explicit exception to the server's metadata-only path.

This design implements the confirmed improvements and the measurement work
recommended by the audit. A Start migration, CDN, adaptive video streaming,
persistent offline media storage, and increased production machine allocation
remain measurement-dependent decisions. They are not silently included as
infrastructure changes. No deployment, push, merge, or production backfill is
part of implementing and verifying the code locally.

Success is demonstrated with browser-transferred bytes, first-image readiness,
next/previous latency, video startup/seek behavior, and bounded work after long
scrolling. Passing metadata unit tests alone is insufficient.

## Chosen approach and alternatives

| Approach                                                                       | Benefit                                                             | Cost and decision                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Stable signed URLs, safe preview reads, bounded prefetch, optimized renditions | Addresses the confirmed causes within the existing deployment       | Selected                                                                                              |
| Stable authenticated media proxy or CDN                                        | Can maintain a stable byte-cache identity across signed-URL renewal | Changes the media delivery and authorization boundary; evaluate after measurement                     |
| TanStack Start with authenticated SSR                                          | Can advance media discovery on cold deep links                      | Does not fix source size, URL identity, or speculative-read side effects; retain Router for this work |

## 1. Media identity and signed URL reuse

Introduce an application-owned media delivery service that returns a signed
URL together with its actual issuance and expiry information. Reuse it across
timeline, item, burst, people, occasion, removal, and preview reads. Reuse is
after current viewer authorization; a cache hit is never an access decision.

The internal key includes bucket/prefix, object identity and revision, response
options, requested lifetime, and disposition. Download-original links remain
distinct from inline viewing links. Never expose storage keys as public IDs.
Concurrent requests for the same identity share one signing operation.

Keep the one-hour viewing signature lifetime. Use a bounded 10,000-entry LRU
with expiry pruning, a 60-second renewal margin, and no retained rejected
promises. A returned cached source retains its original expiry; it must not
receive another hour merely because metadata was requested again. Restart or
credential rotation can cause a new signature and a cache miss. That is an
explicit limit of this first implementation.

Keep private seven-day HTTP freshness for immutable media bytes. Browser
retention and bearer-link validity are separate policies: an already cached
private response may outlive its signature, but any new bucket request still
requires a valid signature. Correct the existing documentation that conflates
the two. Increasing signature lifetime is not the cache fix.

Generated objects use versioned keys. Replacing a derivative publishes a new
identity, never different bytes under a cacheable existing URL. Only sign
representations actually returned, with selection and fallback decisions made
before signing. Gallery responses need thumbnails and concise preview metadata;
burst strips must not sign every unused original and display rendition.

## 2. Explicit media representations

Extend shared media sources with an opaque rendition identity/revision,
content type, byte size, and purpose. Source width and height continue to refer
to the oriented pixels. Read byte sizes and MIME types from the existing
rendition catalog rather than performing a bucket HEAD during every page read.

Represent thumbnail, poster, and display availability explicitly. Missing
preview sources can be null, with a concise state such as pending, ready, or
unavailable. Add photo display candidates for responsive selection and a
dedicated video playback source. Retain an explicit original playback fallback
for a selected video whose optimized copy is not ready.

Update every media consumer and fixture in the same change. No image element
may receive a video URL. A grid must not silently fall back to an arbitrarily
large original. A small browser-compatible original may substitute for a photo
preview only when it meets that purpose's dimension and byte limits. Original
downloads remain available through their existing authorized action.

Preserve aspect ratio, intrinsic dimensions, alt text, and uncropped viewing.
Use the same placeholder component across timeline, viewer, people, bursts,
occasions, removal requests, and completed upload previews.

## 3. Safe preview reads and existing view semantics

Keep the existing actual item-open behavior while adding reads that cannot
record opens, latch seen state, enqueue mail, or create other product events.

Add an authorized batch media endpoint, accepting at most eight item IDs and
an explicit speculative-preview or selected-view purpose. Speculative reads
return economical previews and ready optimized playback sources. Selected-view
reads may also return the authorized original-video playback fallback, so
renewal works before a playback copy exists. The scheduler never requests the
selected-view purpose for a neighbor. Return only currently visible items;
unknown and inaccessible IDs are indistinguishable. Do not return counts of
inaccessible IDs or place them into error details. Reject malformed or excessive
batches before querying. Use the existing rate-limiting and visibility helpers.

Provide a bounded, side-effect-free neighbor read when the client lacks the
next/previous IDs, including entry into an unopened burst. Its ordering and
filter selection must match the existing viewer navigation: hidden frames never
occupy a position or contribute to a count. Request at most two ahead and one
behind, with bounded response size. It must not call the current burst endpoint
that marks a burst seen. Reuse already known navigation refs whenever possible.

Ordinary selection issues one actual detail request through the existing
item endpoint. Retain its existing failure-retry semantics; this work does not
claim exactly-once accounting after an ambiguous failed response. Prefetch and
renewal never call that endpoint. Preview data can display media immediately while the
actual detail response supplies comments and controls. Mutations remain inert
until the current item's authorized detail is ready. Prefetch never increments
open counts or marks a neighboring item/burst seen.

Media renewal uses the safe media service rather than refetching the
open-counting endpoint. Authorization loss removes cached private metadata and
the affected display. Member changes clear all preview scheduler state.

## 4. Viewer prefetch and image presentation

Use one member-scoped scheduler for speculative media across the app. The
current item always outranks background work. Reuse the exact signed source
later rendered by the viewer, and deduplicate by rendition identity/revision.

| Situation                                              | Initial policy                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Settled selected photo                                 | After the current photo loads and 250 ms dwell, warm two photos in the direction of travel and one behind |
| Hover, focus, or touch intent                          | Promote the immediate destination; prewarm route code separately from safe media reads                    |
| Neighbor video                                         | Warm the poster; at most one neighbor video metadata load                                                 |
| Save-Data or 2G                                        | No speculative display-image or video-byte fetches                                                        |
| 3G                                                     | At most the immediate next photo; video posters only                                                      |
| Unknown connection API                                 | Conservative two-ahead/one-behind policy with the same byte and concurrency caps                          |
| Hidden tab, changed selection, route exit, or sign-out | Stop scheduling, discard obsolete work, and abort owned cancellable requests                              |

Allow at most two speculative network operations in total, including at most
one video metadata operation. Reserve each candidate's encoded size against an
8 MiB speculative working budget. Use a 32 MiB decoded-image working budget and
decode only the immediate photo neighbor. Do not count an oversized original
as a cheap preview. Browser HTTP cache and native decoder retention remain
browser-controlled; these limits bound work and references owned by the app.

Use image-loading primitives whose fetched response is reused by the eventual
image. Cancellation of an already-started image request is best effort; do not
claim an AbortController can cancel a native image request. If an abortable
fetch/Blob implementation is chosen during planning, its response reuse and
object-URL disposal must be proved in real browsers before adoption.

Never prefetch a complete original video. A metadata preload is a browser hint,
not a guaranteed byte cap. Enable speculative video metadata only for a ready
optimized source and verify its transfer behavior; otherwise warm its poster
only. An experimental first-segment preload remains disabled unless the browser
test proves the native player consumes those same bytes without a duplicate
download and stays within its explicit budget.

Show a cached thumbnail while a photo's selected display candidate loads.
Swap after decode, preserve the layout, and avoid presenting the previous
item as if it were the new item. Existing motion and reduced-motion behavior
continue to work. Failed image loading can renew its media lease once, then
show an explicit retry state without an infinite retry loop.

## 5. Renewal without resetting video playback

Unify lease expiry handling for the current viewer, visible timeline tiles,
expanded burst fans, and sibling strips. Refresh near-expiry sources when they
are about to be used; do not refresh every retained timeline page merely to
renew an image signature. Suspend background renewal in hidden tabs and check
again on return.

Before play or seek, renew an expiring video lease through the safe media
endpoint's selected-view purpose. On an apparent source failure, attempt one authorized renewal and
retry. Preserve currentTime, paused/playing intent, volume, mute state, and
playback rate across necessary source replacement. Wait for readiness before
restoring the position; handle a shortened duration by clamping. A policy-blocked
play() promise leaves the player paused instead of reporting a network error.
Do not replace a working video solely because a poster or unrelated item
metadata changed. Genuine unsupported media retains the useful error state.

## 6. Bootstrap, timeline, and internal navigation

Replace the serial setup/account/admin-progress navigation reads with one
`GET /api/bootstrap` response containing setup availability, current account
and settings when authorized, and current invitation progress when applicable.
Return `Cache-Control: no-store`. Resolve it from the same current request
authority. Anonymous callers must receive no member or private progress data.

Actual navigation makes one fresh bootstrap request, preserving current
demotion, session revocation, and setup-recovery behavior. Speculative route
preloads remain free of bootstrap calls. Seed the existing account cache from
the result and preserve committed-write recovery during transient errors.
Existing setup endpoints stay available for their focused flows.

Use Router links for all internal media entry points, including removal
previews and decline controls. Opening an item in a new tab still works.

Timeline eager loading becomes a global first-visible-viewport budget, capped
at six thumbnails, rather than four for each day. Keep the existing one-screen
next-page lead and duplicate-fetch guard. Extend viewport-driven thumbnail
loading to expanded bursts and other media lists.

Bound active timeline metadata to five pages using server-issued forward and
backward cursors. Add reverse pagination without reversing the visible order,
splitting atomic days, or weakening filter/visibility checks. Keep a small
anchor record for restoration rather than all evicted pages. Preserve Back,
jump rail, item return, expanded bursts, and selected IDs across window moves.
Do not fetch or mark seen merely because an item is in overscan.

Backward cursors recover evicted newer pages only within the original view's
effective selection, including its `until` bound derived from `?at=`. Preserve
the existing jump behavior: scrolling cannot cross above that jump boundary;
the jump rail remains the way to return to newer days. Bind both cursor
directions to the same effective selection and current visibility rules.

Render a bounded window of day blocks, retain measured spacers and stable
anchors, and preserve the existing content-visibility optimization. A single
large atomic day can exceed the page item budget; verify that case separately
and window its media rows when necessary to meet the long-scroll budget.
Scope query invalidation and renewal to the active selection. Do not blanket
increase every query's staleTime or persist private query data to disk.

## 7. Responsive photos and preview repair

Retain the 480px thumbnail and 2048px maximum display, and add a 960px display
candidate. Do not upscale. The viewer uses sizes/srcset based on its real layout;
prefetch selects the same candidate as eventual rendering. Video posters use
the same economical preview path.

A JPEG original can skip re-encoding only if it fits both dimensions and a
purpose budget: initially 128 KiB for a thumb, 512 KiB for a 960px display,
and 1.5 MiB for a 2048px display. These are selection/encoding targets, not
upload rejection limits. If an encoder cannot meet a target at acceptable
quality, record its actual size and keep speculation within the byte budget.

Evaluate server-generated WebP against JPEG on representative synthetic and
local test fixtures, including encode time and color/orientation. Add a WebP
candidate when it reduces bytes meaningfully at acceptable quality; retain
JPEG fallback. AVIF is not a prerequisite because of its processing cost.
No implementation may assume a requested browser canvas format was produced
without checking the Blob's real MIME type.

Use a durable derivative queue to repair missing thumbs/posters and create
new display variants for existing items. New ingest enqueues required work
without delaying successful original archival. Failed and budget-limited jobs
retain a visible unavailable/pending state, never a fake thumbnail URL.

## 8. Durable media processing and video playback copies

Add an append-only migration for processing state and expanded rendition
purposes. Rebuild constrained tables only through the migration runner's
existing integrity/backup rules. Preserve IDs, foreign keys, object ownership,
original bytes, and existing comments/visibility relationships.

Queue identity is item + source revision + processing recipe version. Persist
attempts, next-attempt time, lease owner/expiry, an attempt fencing token,
result state, and a sanitized error code. Claim one job atomically and renew
its lease while active; expired leases are recoverable after restart. Every
terminal queue update and publication transaction must compare the current
attempt token and unexpired ownership. An attempt that loses ownership stops
and leaves its own outputs eligible for cleanup; it cannot update a newer
attempt. No media network or subprocess work happens inside a transaction.
Queue seeding performs catalog writes only, with bounded resumable discovery
for existing items after startup. Missing previews take precedence over
responsive upgrades; new uploads should not wait behind a whole-archive scan.

Keep one processing job active at a time across photo repair and video work.
Use a child process for costly decoding/transcoding and coordinate it with
the existing fingerprint job so independent maintenance tasks cannot multiply
the decode pressure. Bound input reads, execution time, output bytes, temporary
storage, and child lifetime. Shutdown aborts input, terminates the child,
removes owned temporary files, and leaves recoverable queue state.

Video input uses a job-scoped, metered loopback range reader backed by the
trusted B2 object. It streams with backpressure rather than buffering an 8 GiB
original in Node or copying it to the catalog volume. Bind to loopback only,
expose one opaque job URL for one catalog object, and close it on completion.
The aggregate upstream body-byte budget, including repeated ranges, is twice
the catalog source size plus 16 MiB, capped at 16 GiB plus 16 MiB. Limit a job
to 1,024 upstream requests, two concurrent reads, and 15 seconds of read idle
time; count abandoned and retried upstream bytes against the same budget.
Abort when a budget is exhausted. These are configurable processing budgets,
not claims that transcoding avoids downloading the full original.

Restrict input formats/protocols, disable external media references, and
construct subprocess arguments without a shell. The child receives only the
local job URL; B2 credentials never enter its command line or logs. Outputs go
to a task-owned temporary directory because ordinary MP4 fast-start packaging
requires a seekable completed output.

Default video profile: H.264 plus AAC when audio exists, YUV420p, at most
1280x720 landscape or 720x1280 portrait without upscaling, at most 30 fps,
approximately two-second keyframe intervals, quality-based encoding with a
3 Mbit/s video ceiling and 128 kbit/s audio ceiling, and fast-start MP4.
Preserve orientation, duration, and audio/video sync. Detect HDR transfer
characteristics and tone-map supported HDR inputs to SDR rather than merely
dropping color metadata. Test silent, rotated, variable-frame-rate, and HEVC
inputs. Originals remain the archive authority and download target.

Bound probing to 15 seconds, 16 MiB of input, and 1 MiB of metadata output.
Initially admit photo repair up to 64 MiB compressed input and 24 megapixels,
decoding only the primary still image. Admit video inputs up to 3840x2160 or
2160x3840, 60 fps, and 10-bit samples. Unknown, larger, or unsupported inputs
remain archived and become resource-unavailable for this recipe; these are
processing admission rules, not new upload restrictions. A changed configured
envelope or recipe can make them eligible again.

Use one decoder/filter/encoder thread initially, a 60-second photo deadline,
a 30-minute video deadline,
a 512 MiB output limit, and a 1 GiB scratch budget with an additional 512 MiB
free-space reserve. Limits are explicit configuration. Do not truncate an
asset when a limit is reached: reject the incomplete derived output, preserve
the original, and record the resource condition. Distinguish retryable network
failures from unsupported inputs and resource limits to avoid repeated
expensive retries without a changed condition.

Put the probe and decoder process tree inside an OS-enforced job memory limit,
initially 256 MiB, and leave at least 128 MiB of measured serving headroom
before admission. Check capability at startup and test under the deployment's
512 MiB target. A single thread or periodic RSS measurement is not a hard
memory limit. If process isolation is unavailable or the validated envelope
does not fit, keep automatic media processing disabled with an explicit
diagnostic until a verified resource setting is chosen. A job memory failure
must terminate that job rather than the API. Document this activation
prerequisite; do not silently enable an unsafe worker or change deployment
resources. Existing serving and original archival continue normally.

Ship ffmpeg/ffprobe in the runtime image and validate required codecs/filters.
Photo repair must have a verified HEIC decoder in the runtime; Sharp's prebuilt
package alone must not be assumed to decode HEIC. Use an explicit supported
runtime decoder and test an actual HEIC fixture. Missing local tools should
disable processing with a diagnostic while keeping normal serving available.

Upload derived output through a bounded streaming/multipart B2 operation;
do not extend the existing Uint8Array-only small-object upload by reading a
video into memory. Track each output key and attempt durably before upload,
then persist any multipart upload ID before sending parts. Keep ownership
until publication or cleanup commits; recovery aborts unfinished multipart
uploads as well as deleting completed orphan objects. Reconcile the narrow
initiation-to-ID-persistence crash window by listing multipart uploads only
under the recorded attempt's unique output key.

Publish only after upload succeeds, the source revision still matches, and
the attempt still owns an unexpired lease. Deletion or replacement during
processing must never resurrect an item. Extend the existing object-deletion
gate to recognize processing ownership and serialize cleanup claims against
publication; a key claimed for cleanup cannot become a published rendition.
Test recovery while the old attempt remains alive. Enqueue superseded
objects through the existing deletion mechanism only after the new catalog
reference commits. Never schedule original deletion for a successful upgrade.

## 9. Upload preparation and static delivery

Let upload previews request only thumbnails, avoiding the currently discarded
full display encoding. Use a shared decode coordinator across duplicate
fingerprinting, previews, and transfer preparation, with visible/active work
ahead of speculative previews. Keep transfer concurrency separate from decode
concurrency. Preserve existing streaming hashes, browser recovery storage,
HEIC worker recycling, and object-URL cleanup.

Serve hashed build assets with one-year public immutable caching. Keep the
HTML entry point revalidated, and keep private API responses out of public
caches. Generate Brotli/gzip static text assets during build and serve the
appropriate encoding with Vary: Accept-Encoding, correct types/lengths, and
working ETags. Do not compress already-compressed media as part of this work.

## 10. Verification and rollout evidence

Use red/green tests for behavior, then run the repository's complete checks.
No test uses production email, a production catalog, or a real bucket write.
Local application runs explicitly use development and fake-email settings.

| Area                  | Required evidence                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signing               | Same URL across reads within the lease; correct original expiry; renewal, eviction, concurrent signing, disposition isolation, and authorization changes                                                           |
| Preview reads         | No open/seen/mail effects; hidden IDs indistinguishable from missing; burst and filter order matches actual navigation                                                                                             |
| Scheduler             | Two-ahead/one-behind direction changes; foreground priority; network/memory budgets; hidden tabs; disposal; duplicate suppression; member isolation                                                                |
| Reload and navigation | Real signer plus cache-capable local bucket; ordinary reload and next/previous reuse bytes; hard reload recorded separately                                                                                        |
| Video                 | Range 206/416, metadata requests, seeking, expired URL recovery, preserved position/play state, no original-video speculative downloads                                                                            |
| Processing            | Fenced lease recovery, metered ranges, oversized HEIC/HEVC admission, job memory isolation, timeouts, corrupt inputs, real codecs, HDR/rotation/audio, deletion races, atomic publication, multipart crash cleanup |
| Timeline              | Thousands of items, many pages, a large single day, backward scroll, Back/forward, filters, selection, burst fans, and jump anchors                                                                                |
| Bootstrap             | One current-authority request per navigation; setup races; revoked/demoted accounts; committed-write recovery                                                                                                      |
| Delivery              | Hashed asset cache policy, HTML freshness, compression negotiation, cache validators, and unchanged API fallback                                                                                                   |

Upgrade the local bucket double to support ranges, ETags, conditional requests,
and configurable signature expiry. Run actual cache tests without browser route
interception that disables HTTP caching. Count bytes at the bucket server as
well as browser network events; cross-origin timing fields alone can be zero
without indicating a cache hit. Avoid credentials in reports.

Measure cold and warm first image, p50/p95 next-photo readiness, video startup,
rebuffering, prefetch consumption/waste, long-task/DOM growth, API signing time,
and worker peak memory. Establish before/after results using the same fixtures
and throttling. Target zero redundant media response-body bytes on ordinary
reload within a reusable lease and zero new media bytes when selecting an
already-prefetched photo. Separately report the required metadata/auth requests.

Use existing Chromium/WebKit browser infrastructure and supported Firefox
coverage where available. A local browser pass does not claim actual iPhone
acceptance or production performance. Keep a documented manual checklist for
those environments and for inspecting real B2 206 responses and cold starts.

Do not change deployed machine counts. Document the exact optional
FLY_MIN_MACHINES_RUNNING=1 choice and how to compare cold starts. Evaluate CDN,
HLS, and Start only if post-change measurements identify a remaining relevant
bottleneck. Optional first-video-segment prefetch ships enabled only when
cross-browser byte-reuse tests support it.

## Documentation and implementation boundaries

Implementation is restricted to the media-related web/server/shared modules,
their migrations/configuration/build plumbing, tests/fixtures, and supporting
docs. Update architecture, web, server, archive, items, setup, video
conversations, configuration, deployment, migrations, and e2e documentation
where behavior changes. Add docs/media-loading.md for the durable explanation;
keep docs/media.md focused on its existing generated-fixture subject.

The implementation plan will sequence shared contracts and migrations before
dependent callers, and separate independent static-delivery/upload work from
the coordinated media API and viewer changes. It must retain a checklist for
every section above, including measurement-conditioned outcomes, and include
spec compliance and code review before completion. No generated skill folders
or unrelated functionality are modification targets.

## External references checked during design

- [HTTP cache identity, RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html#section-2).
- [B2 object retrieval and response headers](https://www.backblaze.com/apidocs/s3-get-object).
- [PhotoSwipe nearby-slide defaults](https://photoswipe.com/options/#preload).
- [TanStack Router preloading](https://tanstack.com/router/latest/docs/guide/preloading).
- [TanStack Start capabilities](https://tanstack.com/start/latest/docs/framework/react/overview).
- [FFmpeg container and fast-start behavior](https://www.ffmpeg.org/ffmpeg-formats.html).
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html).
- [FFmpeg protocol restrictions and I/O timeouts](https://ffmpeg.org/ffmpeg-protocols.html).
- [Linux cgroup memory controls](https://docs.kernel.org/admin-guide/cgroup-v2.html).
- [Sharp output and HEIC dependencies](https://sharp.pixelplumbing.com/api-output/).
