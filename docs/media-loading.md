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

A5 must implement the navigation handoff in a coordinator that lives for the
member, across item-route transitions:

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
A5 must cover failed and interrupted navigation as well as successful adoption.

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
