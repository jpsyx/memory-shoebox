# Media loading

The SPA continues to fetch photos and videos directly from private B2 storage.
Fastify authorizes catalog reads and returns viewing sources; it does not proxy
media or keep a persistent offline cache. Original archives and visibility,
open and seen behavior stay on their existing paths.

## Stable signed leases

One B2 client owns an in-memory LRU containing at most 10,000 resolved or
pending leases. A lease is a URL plus its actual `issuedAt` and `expiresAt`.
Repeated authorized reads reuse all three values until the signature has
60 seconds left, then sign again. Viewing signatures last 3,600 seconds. The
low-level signer explicitly aligns its signing date to the second, so the
expiry sent in a media source describes the actual signature rather than the
clock of a later read.

The cache identity includes endpoint, bucket and key prefix, the immutable
catalog rendition ID and storage key, signature TTL and download disposition.
The namespace stays internal and belongs to one credential context. Separate
B2 client instances never share leases. Rendition replacement must create a
new ID and key rather than overwrite bytes at an existing revision.

Concurrent requests for a rendition share pending signing work while its
second-aligned validity is outside the renewal margin. Stale pending work is
replaced, and its later completion or rejection cannot alter the replacement.
Failed work is removed so a later request retries. Expired entries are replaced
on access; least recently used entries are pruned on overflow. A backwards clock change
clears all cached work. Clearing or eviction cannot let an older pending
signature repopulate the cache. These limits apply to pending signatures as
well as completed leases.

Visibility and session checks precede lease access. A warmed source does not
authorize any later API read: an item that becomes invisible supplies no new
source to that viewer. A previously issued storage URL remains a bearer link
until its original signature expires, as it did before lease reuse. Existing
browser bytes can remain fresh after a visibility change, too.

`presignGet` remains separate for focused original-download and maintenance
callers. Both signing paths request `Cache-Control: private, max-age=604800`,
seven days of HTTP freshness for immutable bytes. Freshness and authorization
lifetimes are independent: reusing a cached response does not require a new
network request, but B2 rejects an expired signature when a request reaches it.
There is no claim that private caching revokes already downloaded bytes.

## Lifecycle limits

A process restart or credential-context replacement starts an empty cache.
LRU eviction also loses a lease. A later read can therefore produce a different
URL and transfer the same bytes again. Expired URLs must be refreshed through
an authorized catalog read, preserving the existing client retry behavior.
Lease reuse does not persist signatures across deploys or promise offline use.

## Local browser evidence

`e2e/media/cache.spec.ts` uses 5,000 isolated catalog items, an actual B2 signer
with test credentials and a local HTTP bucket supporting caching, expiry and
ranges. It uses no request interception, production bucket or real email.
The ordinary photo reload regression checks that media body transfer is zero
while allowing fresh authorization/API requests. The pre-change measurement
transferred 21,746 body bytes on ordinary reload in both Chromium and WebKit.
Run the test with:

```sh
pnpm exec playwright test -c playwright.media.config.ts e2e/media/cache.spec.ts
```

The fixture appends measurements to `tmp/media-loading/baseline.json`.
`baseline-before-product-changes.json` is the frozen original comparison.
Chromium exercises genuine hard reload separately. Genuine WebKit hard reload
is explicitly unverified; its fresh-cache revisit is separately labeled.
Loopback timing does not reproduce B2 latency or throughput. Body bytes exclude
headers and count socket payloads queued before a disconnect. WebKit also lacks
the measured Long Tasks API. The browser test measures navigation and range
traffic alongside caching, without claiming later media-loading work is done.

## Bounded preview metadata

The media-only preview and neighbor endpoints described in [items.md](items.md)
provide authorized metadata for future speculative loading. They never seed the
actual-detail query cache or alter open/seen records. Each neighbor step probes
one visible frame or collapsed timeline entry with `LIMIT 1`; only up to three
chosen items reach the rendition batch. Indexed ordering avoids temporary sorting
of whole days or bursts. Visibility filters can still scan past hidden rows, so
bounded returned metadata does not promise constant database CPU time.

The isolated local growth check expands six items to 1,006 and a four-frame burst
to 504 frames. The tested backward-entry path executes eight SQL statements in
both cases and returns at most two rows per statement. EXPLAIN confirms use of
all three navigation indexes without temporary sort trees. This is a query-shape
regression, not a production latency benchmark.

`createMediaPreviewStore(memberId)` owns at most 64 entries in a memory-only LRU.
Reads and writes promote an entry; removal and clearing drop it. Each store is
independent, including a replacement for the same member. The store additionally
exposes `captureEpoch()`: asynchronous consumers capture a token before starting
work and call `put(previews, token)` on completion. `clear()` invalidates every
captured token, and a token from another store is rejected even when an aborted
request still completes. Calling `put(previews)` without a token is reserved for
synchronous seeding. The member provider owns this lifecycle and keeps the store
separate from actual-detail query authority.

## Member-scoped speculative loading

The signed-in shell owns a `MediaLoadingProvider`. `useMediaLoading()` exposes
its member's preview store, scheduler, safe preview reader and safe neighbor
reader. Actual-detail queries remain separate. Every asynchronous preview write
captures the store epoch before its request and passes it to `put`; aborted
reads also check their signal before returning or writing. A selected-view
renewal uses the same safe reader but runs as foreground work. Representation
purpose and urgency are separate: a visible-thumbnail renewal calls
`readPreviews(request, "foreground")` even when the request purpose is
`speculative-preview`. Selected-view requests always run as foreground work;
other preview requests default to speculative priority.

The viewer calls `scheduler.schedule(candidates, environment)` after its
selected source is ready. That starts a 250 ms dwell for a new selection. The
neighbor policy assigns rank 0 to the immediate photo in the direction of
travel, rank 1 to the second, and rank 2 to the one behind. It takes the
viewer's source-selection function so warming uses the exact rendition that
will later render. Videos select a poster (or economical thumbnail), never
original playback. The scheduler sorts ranks, deduplicates rendition identities
even across lease URLs, and keeps at most three candidates. Completed identity
bookkeeping stays inside that window.

There are two related limits. The scheduler reserves each started candidate's
actual encoded bytes against 8 MiB, including a retained immediate neighbor.
Only that immediate photo may request `decode()` and remain referenced, within
a 32 MiB estimate of width times height times four. Distant images and posters
release their element references as soon as loading settles. A shared two-slot
operation gate covers speculative preview/neighbor API requests as well as
media loads. Selected-view renewal and actual foreground rendering bypass it.
A source whose lease expires while awaiting an operation slot is not started.

Save-Data, slow-2G, 2G and hidden visibility disable speculative media work.
3G allows only the immediate photo and video posters. Browsers without Network
Information use the same bounded two-ahead/one-behind policy. The provider
stops obsolete work on route or connection changes and when the tab hides.
Route changes preserve already warmed preview entries for the destination;
sign-out and member replacement clear the store and invalidate its epochs.
`clearMember()` installs the settlement barrier synchronously during provider
cleanup; permanent disposal can wait until React StrictMode's effect replay
has had a chance to reacquire the same owner.

### Native image ownership and cancellation

`loadSpeculativeMedia` loads a native `Image` with the exact selected URL,
without a Blob fetch or a different CORS/referrer policy. The eventual image
must retain that default request mode and choose that same candidate. Warming
sets low fetch priority; foreground adoption remains an ordinary image render.
A5 owns responsive source selection, selected-source readiness and intent wiring;
installing the provider alone does not start automatic neighboring downloads.

Native image requests have no reliable AbortController transport cancellation.
Aborting marks the result obsolete and suppresses any not-yet-started explicit
decode. The primitive deliberately leaves the source alone until native
load/error and any already-started decode settle. Only then can the scheduler
release its operation and byte reservations. This can waste an already-started
transfer; it does not pretend a signal cancelled those bytes.

`const releaseForeground = scheduler.promote(id)` acquires a foreground lease
before selection/route cleanup. `clear()` preserves that ownership so the
adopting transition does not cancel a shared in-flight load. The caller must
release the lease when adoption fails or its foreground source/view exits.
Each call returns an idempotent release bound to that particular operation;
multiple owners release independently, and an old release cannot affect a later
load of the same rendition. Releasing the final owner cancels queued starts and
suppresses pending explicit decode. Already-started native work still reserves
its bytes and operation slot until settlement. Late completion cannot repopulate
speculative retained state. Member disposal aborts all remaining ownership.

The navigation coordinator owns the handoff for the member across item-route
transitions:

1. Before navigating, promote the exact rendition and retain its release callback
   with the intended destination item/source. The coordinator owns the lease
   immediately, including while navigation is pending.
2. Transfer that callback to the matching adopting view/source when adoption is
   confirmed. The old route's cleanup only clears speculation; it must not release
   the destination's lease. The adopting view releases on source replacement or
   exit, and drops its callback reference.
3. If navigation rejects, redirects, is superseded, or settles without matching
   adoption, the coordinator releases the pending lease. Coordinator teardown
   releases every pending lease. A missing destination mount must never leave
   ownership waiting indefinitely.

The provider's route cleanup cannot infer that handoff and does not implement it.
Regression coverage includes failed and interrupted navigation as well as successful adoption.

Member replacement retires private metadata immediately, then uses a barrier
containing only operation settlement to delay the next member's speculation
until the old native work settles. This preserves the total operation/byte caps
across provider replacement without sharing preview data. A slow old transfer
can delay later speculation; foreground work is never blocked. Browser HTTP
cache retention and implicit native decoder memory remain browser-controlled.
The budgets bound work and references owned by this app, not total browser RAM.

Optimized-video metadata transport is not active. The default-off
`media.prefetch.videoMetadataEnabled` records the M2 acceptance gate; flipping
that policy value alone does not establish support. Both the scheduler and
load primitive currently reject video-metadata candidates. M2 must implement
and measure an actual optimized-source path before enabling it, with at most
one video metadata operation inside the two-operation total. There is no
speculative original-video or first-segment transport.

### Native cache-reuse evidence

`e2e/media/prefetch.spec.ts` serves the actual native-image primitive through a
test-only JavaScript endpoint on M1's isolated app origin. The separate local
bucket records one 21,746-byte warm transfer in Chromium and WebKit; after
releasing the speculative element and navigating to the normal viewer, the
same signed URL displays with zero additional media body bytes. A second case
aborts immediately after starting a native image and observes its full body
before the promise settles with `AbortError`. This validates the conservative
settlement rule, not guaranteed browser transport cancellation.

```sh
pnpm build
pnpm exec playwright test -c playwright.media.config.ts e2e/media/prefetch.spec.ts
```

These tests use isolated catalog data, test signatures, fake email and no
request interception. They do not change the frozen pre-product baseline or
claim actual-iPhone, production-B2, source-selection or automatic-viewer
prefetch acceptance; A5 and M2 own the remaining integrated evidence.

## Visible lease renewal

`useMediaLease({ itemId, initialMedia, purpose, isVisible })` registers an
already authorized source with the member-owned lease coordinator. Initial
sources seed the preview store synchronously, so a fresh mounted image or video
does not request duplicate metadata. Descriptive fields still follow current
detail or timeline props; media renewal does not replace their metadata. The coordinator has one expiry timer and
coalesces same-purpose renewals into batches of at most eight IDs. It always
uses the foreground preview reader, including economical thumbnail requests.
It never fetches actual item detail, changes open/seen records, refetches all
retained timeline pages, or updates a page's `metadataUpdatedAt` provenance.

Prints, expanded fan frames and sibling links report actual intersection through
`useMediaVisibility`: zero root margin and a positive intersection ratio. Merely
mounting an overscan node is not visibility. C3 can use the same
`MediaLeaseRegistration.setVisible(boolean)` contract for a windowed timeline.
Only visible consumers renew at the 60-second margin. Hidden tabs suspend the
timer and recheck on visibility/focus return; explicit play, seek and retry
checks remain foreground operations. Unmount removes subscriptions and queued
starts; route/member teardown retains the existing abort and epoch barriers.

A denied item loses its sources in every mounted lease consumer and in the
preview store. Removing an entry also invalidates outstanding store-write epochs,
so an older response cannot restore it. The coordinator retains only denied
item IDs as member-lifetime tombstones, never a source history. Cached props
cannot reseed those IDs. Automatic work does not retry 401/403/404; 401/403 also
clear the member's media state. An explicit `renew()` can recover only from a
fresh authorized safe-media response. Member retirement clears the tombstones.
A recovered mounted consumer also resumes visibility/focus observation, including
when its authorized response completes while the tab is hidden.
A newly authorized rendition change invalidates older pending writes as well.

Photos retain the same item's already decoded image during renewal, then switch
after the matching candidate decodes. A failed selected image gets one automatic
safe renewal; another failure shows an explicit retry. A denial removes retained
pixels, including the original thumbnail fallback. Each signed-URL change stays
inside the same failure-retry chain. Selected videos preserve their native node
and playback state through lease replacement; [video-conversations.md](video-conversations.md)
describes the transport checks.

`e2e/media/renewal.spec.ts` advances only the isolated catalog, bucket and browser
clocks. Chromium and WebKit verify original-video renewal, paused seek state, expired play gestures,
photo decode completion and unchanged actual-detail request counts without
request interception. The shared decoded-photo measurement waits for the current
frame's readiness, so a retained old image cannot satisfy renewal acceptance.
Raw A6 evidence lives in `tmp/media-loading/a6-*`; the frozen pre-product baseline
and earlier A2/A5 evidence remain unchanged. Loopback evidence does not establish
production B2 timings or actual iPhone behavior.

## Durable processing queue and ownership

Migration `0017_media_processing` installs the catalog foundation for derivative
processing. `createMediaProcessingQueue({ database, clock })` exposes enqueue,
claim, renew, and finish without starting workers, timers, downloads or decoders.
This stage does not activate automatic media repair. Runtime isolation, discovery scheduling and publication remain separate
integration steps. Bounded storage I/O is described below. Original archival and existing serving continue independently.

A job's identity is `(item_id, source_rendition_id, recipe)`. Duplicate enqueue
leaves its state, priority, attempts and token untouched, including complete or
unavailable jobs. A changed policy must use a new recipe identity. The source ID
is a revision snapshot, without a rendition foreign key: later replacement must
leave the attempt and its cleanup ownership discoverable. Publication must still
check the current source revision before adding any rendition.

Claiming reserves SQLite's write lock with a short immediate transaction, then
one indexed `UPDATE ... RETURNING` selects a due pending job or an expired running
job. A global live-lease guard permits at most one live processing claim across
queue instances and processes. Eligible work sorts by descending priority, then
next-attempt time, creation time and job ID. Selection returns one row and uses no
per-item queries; it can still sort the eligible set, so this is not a constant
CPU-time guarantee. B5's shared decode coordinator will additionally serialize
this work with fingerprint decoding.

A shared promise gate serializes processing-owned claim, renew, finish and output
ownership transitions
across handles in the same Node process before acquiring a connection. This
prevents SQLite's synchronous busy wait from blocking the event loop that must
commit the preceding local transition. Errors still reach their caller and
release the gate. The bounded tradeoff is serialization of these short catalog
transitions even across different local catalog files. SQLite's immediate
transaction and SQL ownership checks remain authoritative across processes.
The gate does not coordinate arbitrary catalog writes or caller-owned
transactions. Enqueue deliberately bypasses it so ingest can enqueue while
holding its own transaction, including when a claim awaits that connection.

Each claim gets a fresh token and a 120-second lease. A worker must renew every
30 seconds; this queue does not create a heartbeat timer. Renew and finish check
the database's running state, identity, token and strictly unexpired lease in
an immediate transaction. They return false after expiry, reclamation, completion
or deletion. The claim object's expiry is only the original snapshot: a successful
renewal updates the database, and later calls with that same object remain valid.
Finishing clears ownership, either recording complete/unavailable or scheduling
pending work with a UTC ISO next-attempt timestamp. Errors are machine codes,
never raw provider messages. Expired ownership remains recoverable after restart.

`media_processing_outputs` reserves a unique immutable storage key for an attempt
and records its derivative purpose, state and optional multipart upload ID. Its
states are reserved, uploading, uploaded, published and cleanup. Deleting a job
or item sets its output parent references to null; token, key and multipart ID
survive for cleanup. The transfer layer below enforces upload and cleanup
ownership transitions; later publication must use the same fencing contract. The singleton `media_processing_discovery` row keeps a nullable item-ID
cursor without a foreign key, so deleting the last scanned item cannot reset
catalog progress. Migration initializes the cursor without scanning media.

## Bounded processing transfers

The transfer layer is available to the later processing runtime; it does not
start workers, decoding, discovery, or automatic repair. `createMediaRangeReader`
serves one original at a random path on `127.0.0.1`. The child receives neither
the storage key nor the signed B2 URL. GET ranges are segmented into upstream
requests of at most 8 MiB; HEAD is answered locally. At most two child reads
run concurrently, with a 15-second timeout while awaiting upstream headers or
body data and backpressure while the child drains bytes. Closing the reader or
aborting its signal cancels active reads and closes the loopback listener.

One reader is one job meter. It permits at most 1,024 upstream requests and
`min(2 * sourceBytes + 16 MiB, 16 GiB + 16 MiB)` consumed upstream payload bytes.
Rereads and failed or cancelled reads retain their charges. Concurrent segment
reservations prevent the two reads from spending the same remaining allowance.
Ordinary GETs and open-ended ranges can advertise an object larger than the
current allowance: each upstream segment is clamped to the remaining allowance
and the 8 MiB segment ceiling. A child can cancel after reading its probe bytes.
If it continues past the consumed cap, the response terminates and `getFailure()`
records the budget reason. Capacity temporarily reserved by another read is not
exhaustion: the competing read waits until that reservation is consumed or
released, and cancellation or shutdown removes its wait without another request.
The proxy requires an exact 206 Content-Range, expected total and Content-Length,
and identity encoding, and checks changing ETags when supplied. Ignored ranges
and invalid metadata are cancelled before consuming their bodies. The meter
counts every consumed body chunk before forwarding it, including chunks discarded
when a child disconnects. It cannot measure packets already in flight or buffered
by the transport when a response is cancelled at its headers; it does not claim
a wire-byte measurement.

B3 must create the reader with `phaseByteLimit: 16 * 1024 ** 2` for probing.
`setPhaseByteLimit(limit)` is allowed only with no active reads. Limits always
apply to cumulative job bytes; setting a limit again cannot reset consumption.
After checking the probe outcome, B3 can lift the phase cap with `undefined`, or
set a stricter admitted processing cap, using the same reader. Bytes, requests,
and retry charges survive every phase change. New readers must not be created
between probe and processing to reset the job allowance.

`getFailure()` exposes sanitized reasons independently of ffprobe/ffmpeg stderr.
`input_byte_limit`, `input_request_limit`, `phase_byte_limit`, `source_changed`,
and `source_range_invalid` are terminal for the attempted read/phase. The first
terminal reason survives later transient failures. `source_truncated`,
`upstream_timeout`, `upstream_unavailable`, and `concurrent_read_limit` are retry
classification candidates; B5 owns the final job policy. Cancellation alone is
neutral. A phase change clears only `phase_byte_limit`; B3 must inspect the probe
result before lifting that cap. No error response or diagnostic exposes a signed URL.

`uploadProcessingOutput` starts from an already reserved immutable key. It checks
the current database job identity, token, running state and lease before changing
reserved to uploading, before recording the multipart ID, and before changing
uploading to uploaded. The caller's lease-expiry snapshot is not authority.
`B2Client.putObjectStream` awaits durable ID recording before consuming output or
sending a part. It reuses one 8 MiB part buffer, uploads only one part at a time,
checks the declared size, caps output at 512 MiB, and propagates cancellation to
initiation, parts and completion. Its dedicated SDK client disables automatic
retries and is destroyed after the attempt. Transient failures are retried at
the job layer, so a lost initiation response cannot silently create a second
upload. Failures attempt multipart abort without reusing the cancelled signal;
failed or uncertain aborts retain durable cleanup ownership.

`recoverProcessingOutputs({ database, b2, now })` claims at most 100 expired,
replaced, completed-job or orphaned outputs per pass. In one short transaction it
moves them to cleanup and enqueues object deletion. It then lists every upload
for the exact prefixed key, across all listing pages, and aborts them outside SQL.
Listing is required even when an ID was persisted, and closes the initiation
before ID persistence crash window. Cleanup ownership is permanent. The output
row retains daily multipart rechecks. Failed abort/list attempts keep their actual
attempt time, so they cannot monopolize a bounded scan ahead of later outputs;
a transient multipart-cleanup failure can wait up to the daily cadence. Object
deletion retains its separate retry queue. Object deletion keeps tombstones, rechecks after the
existing settling window and then daily, and HEADs absent keys to avoid repeated
hide markers. These rechecks catch initiations or completed objects that arrive
after an earlier empty listing or delete.

Reserved, uploading and uploaded outputs protect their keys from the generic
deletion drain, including expired rows until recovery claims cleanup. Published
renditions retain their ordinary catalog protection. Output transitions acquire
the existing cleanup lock, then the shared processing transition gate, then SQL.
The SQL transaction and processing gate are released before storage I/O. Durable
conditional transitions remain authoritative across handles/processes, where the
cleanup mutex is not shared. B5 publication must use the same order and gate,
require an uploaded output with the matching live attempt, and verify the current
original before inserting renditions and marking published. It must never reclaim
a cleanup-owned key. This layer prevents a late transfer callback from restoring
uploading/uploaded state after cleanup; publication itself remains B5 work.

## Isolated decoding runtime

The B3 runtime is available as a building block; no automatic processor is
started yet. `createMediaProcessRunner({ cgroupRoot, scratchRoot, clock })`
owns one job cgroup and exposes `run`, `dispose`, and readonly `scratchPath`.
The first command initializes the owned directory and group. Sequential probe,
photo/video and fingerprint commands reuse that context. A fixed exclusive
child cgroup prevents two runners using the configured subtree concurrently.
Each command's lightweight shell joins the group before loading media tools
or Node decoding code. Fastify stays outside it.

The kernel controls are `memory.max=268435456`, `memory.swap.max=0`,
`memory.oom.group=1`, and `cpu.max=100000 100000`. Each command rechecks measured
ancestor/system headroom for the full job allowance plus a 128 MiB serving
reserve. Thread-related environment settings are one; FFmpeg probe/codec
commands also set one thread. Recipe callers must explicitly configure
Sharp concurrency/cache and FFmpeg encoder/filter threads. Commands inherit
only a small environment, never storage/email secrets. Stderr is discarded
into a sanitized 64 KiB ring, and errors expose stable `processing_*` codes,
not subprocess arguments, URLs or raw library failures.

Cancellation, deadlines, stdout exhaustion and child exit kill the whole
owned cgroup and wait for it to empty. `dispose()` cancels outstanding work
before removing the group and only its random scratch directory. The maximum
stdout is 1 MiB. Memory OOM has a distinct `processing_memory_limit` failure.
Outputs belong under `scratchPath/output`; files have a hard 512 MiB size
limit, with aggregate output limited to 512 MiB and total scratch to 1 GiB.
A 512 MiB free-space reserve is checked before and during work. Aggregate
checks run every 100 ms and at command boundaries, so transient disk overshoot
is possible; this is monitoring plus a hard per-file limit, not a disk quota.

`probeMedia` has a 15-second whole-operation deadline and bounded metadata.
The caller creates the B2 reader with a 16 MiB probe phase. Probe reads use
that same meter, including the format header and later video seeks. Photo
inspection saves only a prefix of at most 16 MiB in owned scratch. HEIC uses
bounded `heif-info` output and box metadata before any full photo download or
primary decode. Unreadable metadata stays unavailable; stored catalog
sizes/dimensions never substitute for probe evidence. ICC-only/unknown HEIC
color transfer, animation, multiple top-level images, GIF, unsupported
containers/codecs, and incomplete metadata are conservatively unavailable.
HEIC dimensions already include its transforms, so its returned rotation is
zero. Other supported inputs use bounded ffprobe JSON.

The supported decoder inputs are JPEG, PNG, still WebP, HEIC, and H.264/HEVC
in MP4/QuickTime with recognized brands. PNG/WebP animation markers are
checked before decode. Forced demuxers and a narrow protocol allowlist exclude
playlists and nested containers; MOV external data references and absolute
reference paths are disabled. `getMediaInputArguments` carries the same
restrictions into later video recipes. Input URLs must be credential-free
`http://127.0.0.1:<port>` reader URLs; photo tools read owned local files.

Admission accepts photos up to 64 MiB and 24 million pixels, one primary
still, with a 60-second recipe budget. Video limits are 3840×2160 or
2160×3840, 60 fps, 10-bit input, and 30 minutes; known PQ/HLG video can proceed
to a tone-mapping recipe. Unknown or missing dimensions/rate/depth/duration
fail admission. `app.config.ts` also records the later 480/960/2048 image
candidate budgets and compatible playback ceilings.

For B4/B5 integration, await probe completion, inspect the reader's typed
`getFailure()` even when metadata parsed successfully, and require admission
before lifting its phase cap. Stop/settle every source read before that idle-only
transition, reuse the same reader, and retain its aggregate accounting. The
runtime does not own or clear reader failures. Parent lifecycle code must
bound full photo acquisition to 64 MiB, use one shared recipe deadline, write
outputs in `output/`, validate final rendition sizes, and dispose both the
reader and runner on every path. A nonzero child exit is not a valid output.

Real local codec evidence covers the Docker media-tools target, primary HEIC
orientation/color, JPEG/WebP encode/decode, H.264/AAC, and zscale/tonemap.
Actual delegated cgroup memory/CPU enforcement and the 512 MiB serving
envelope remain unverified on the macOS host and read-only Docker setup.
Conditional Linux tests are explicitly skipped there, and runtime capability
checks return `processing_isolation_unavailable`. Automatic work remains off.
