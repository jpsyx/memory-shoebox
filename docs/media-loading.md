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
synchronous seeding. The member provider and speculative scheduler will own this
lifecycle; this step does not start speculative byte downloads or decoding.
