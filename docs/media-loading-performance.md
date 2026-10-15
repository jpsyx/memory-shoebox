# Media loading performance evidence

The branch preserves the TanStack Router SPA, one Fastify deployment, direct
private B2 media delivery and original archives. Local measurements use generated
fixtures, loopback transport and native Chromium/WebKit. They establish the
specific body-reuse, authorization, bookkeeping and bounded-retention behavior
asserted by the tests. They are not production latency or capacity measurements.

## Reproduction and identities

From the repository root, compile only the browser bundle with production
semantics, then run the isolated suites:

```sh
NODE_ENV=production pnpm build
pnpm exec playwright test -c playwright.media.config.ts
pnpm test:e2e:video
pnpm test:e2e:admin
NODE_ENV=development ENABLE_FAKE_EMAIL=true pnpm exec playwright test --project=upload-chrome --project=upload-webkit
pnpm check
NODE_ENV=development ENABLE_FAKE_EMAIL=true pnpm test:e2e
```

Leave parent `NODE_ENV` unset for the video/admin package scripts, whose Vite
build then selects production internally. The video/admin constructors
explicitly configure their API as development and
fake-email with no-mail injection. The ordinary E2E runner independently scopes
production `NODE_ENV` to its compiler and validates its exact owned local catalog
and fake bucket before opening resources. These commands never launch a production
API or use real mail recipients or a remote bucket. Install the native engines
and the documented codec/HEIC fixture tools before browser acceptance; missing
engines or encoders must remain explicit failures, not silent skips.

M1's frozen file is `tmp/media-loading/baseline-before-product-changes.json`,
SHA-256 `5eea5aee867ec8b485a1548627ea625fa97c7e4a6f11e8c292907d621f8d252a`.
Its final observations are October 14, 2026 at 16:50:32.012Z (Chromium) and
16:50:55.983Z (WebKit), revision
`11ee6f73cf8b67ddec573ecec1f6826c0ad1e7da`. The append-only `baseline.json`
contains later runs and must never be substituted for that frozen comparator.

The media catalog contains 5,000 items, including one atomic 1,000-item day and
two five-frame bursts. Small/large photo bodies are 3,809/21,746 bytes, and the
video is ten seconds. The fake bucket adds 25 ms latency and approximately
1 MiB/s per response. Memory acceptance separately uses 10,000 items. The original
30-transition scenario retains its rapid forward/back pacing; the additional
30-transition alternating two-item dwell scenario waits 300 ms, allowing the
product's 250 ms dwell. A separately labeled forward scenario visits 31 distinct
photos over 30 moves.
Both wait for the actual destination's chosen source to decode. Their timing
distributions must remain separate.

## Historical provenance

| Evidence                               | Valid interpretation                                                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen M1, A1 and C3 standalone builds | Source/fixture observations retained; compiler `NODE_ENV` and served-bundle digest were not recorded. No matched production React latency comparison.                                                                       |
| Pre/current C4 preview comparison      | Matched development Vite flow and five identical codec fixtures. Ten derivative JPEG encodes became five. Main-thread task duration excludes worker CPU; the slower WebKit post-change sample remains part of the evidence. |
| C4 engine/surface combined build       | Historical compiler environment was development. Final current acceptance is separately labeled.                                                                                                                            |
| Historical C5 compression              | 74.53% Brotli savings across the same eligible text bytes is valid independently of React flavor. It is neither whole-build savings nor a latency claim.                                                                    |
| Current controlled M2 build            | Compiler explicitly uses production React/Vite; bundle SHA inventory and direct production-flavor assertions accompany local development/no-mail runtime evidence.                                                          |

Historical M1 rapid navigation medians/p95 were 65.25/170.58 ms (Chromium) and
54.77/178.83 ms (WebKit). Ordinary reload transferred 21,746 bytes in both.
The unbounded timeline observation reached 3,392 media nodes after six
continuations. These numbers retain their original environment limitations;
current measurements below are independently controlled observations.

## Final correction acceptance

The combined correction implements both important and all eight consolidated
minor review findings. It also corrects the stylesheet cascade regression found
by ordinary acceptance, using Mantine's supplied CSS layer without changing
colors or contrast thresholds. The controller's scoped rereview is pending.

| Final layered acceptance                 | Result                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Native media                             | 80 passed, exit 0, 6.7 minutes                                           |
| Dedicated video                          | 40 passed, exit 0, 56.6 seconds                                          |
| Actual built-static output               | 28 passed across four split suites, exit 0                               |
| Ordinary full suite                      | 377 passed, 3 failed, 1 existing fixme, exit 1                           |
| Separate unchanged affected verification | All three original WebKit light reentry cases passed, plus setup; exit 0 |

The full ordinary run is **not labeled clean**. Two long WebKit protocol stalls
match actual host sleep intervals; the 768px role-query failure occurred during
DarkWake and its cause remains unproven. A passive isolated diagnostic passed,
then all three original affected cases passed without instrumentation, retries,
timeout changes, forced scrolling or assertion changes. Both 264-file upload
scenarios and the recovery, reauthentication and prior contrast failures passed
in the full run. All failures and traces remain preserved.

Ordinary app/editor/upload checks used the layered `dist-e2e`; its isolated media
fixtures still served the preceding standard bundle. The subsequent fresh
80-case run separately qualifies the final layered standard bundle. Exact
commands, numeric exits, discovery parity, workspace checks and final source
comparison are indexed in
`.superpowers/sdd/2026-10-14-media-loading/final-fix-report.md` and
`tmp/media-loading/final-fix/`. No new skip, retry, timeout or acceptance-threshold
change was introduced. External cgroup, HDR, physical-device and production
transport qualifications remain listed below.

## Final layered browser results

The corrected stylesheet bundle passed **80/80 native media cases** in 6.7
minutes. Mantine defaults use their supplied CSS layer so extracted product
styles retain override priority. This fresh run was required by that product
correction; it is not a repeat chosen to replace the earlier slow timing result.
The unchanged PNG cases verify actual response bytes, MIME and selected source,
visible native decoding, selected readiness and neighboring image work in both
engines. Encoded PNG dimensions are distinct from density-corrected naturalWidth.

`tmp/media-loading/final-fix/production-inventory-layered-native.json` records
390 production React standard artifacts and 423 changed/deleted source paths
against `c36e3c7ba99bf31b48e564e6b46dc5ad37c34e6c`. Its binary-diff SHA256 is
`1358ceac5cbcad565ffc629a2202cac7df0553f4b5691b2b41e009543440a117`.
The compiler used production semantics; local APIs remained development,
fake-email and no-mail. `cache-raw-layered.json` freezes observations recorded at
21:12:11.910Z and 21:15:14.942Z on October 15, 2026. `measurements-layered.json`
records the same median/nearest-rank p95 derivation and ten raw artifact hashes.
Final source comparison records any later documentation-only changes separately.

| Observation                                                    |         Chromium |           WebKit |
| -------------------------------------------------------------- | ---------------: | ---------------: |
| Cold first image                                               |        141.70 ms |        241.72 ms |
| Original rapid navigation p50 / p95                            | 65.68 / 83.22 ms | 70.41 / 86.91 ms |
| Ordinary warm reload                                           |         86.24 ms |        124.56 ms |
| Ordinary reload body bytes                                     |                0 |                0 |
| Alternating two-item navigation p50 / p95                      | 49.11 / 67.79 ms | 48.52 / 62.93 ms |
| Alternating selected display / all-media bytes                 |        0 / 3,809 |        0 / 3,809 |
| Thirty distinct forward moves p50 / p95                        | 45.47 / 62.51 ms | 47.71 / 68.97 ms |
| Forward new selected body bytes after completed native warming |                0 |                0 |

The preserved pre-layer WebKit rapid p95 **465.39 ms** remains unexplained and
may represent remaining lag. The lower value in this required new-bundle run
does not establish that CSS layering caused a latency change. There is no
matched production A/B comparison or speedup claim. The later ordinary-suite
host-sleep interruptions occurred after the pre-layer measurement and do not
explain its tail. Both raw snapshots remain independently available.

Each original scenario still records 62 selections and 62 opens. Each dwell
scenario records 31 of each; all 30 completed forward handoffs add zero selected
body bytes. Alternating direction still requires one 3,809-byte thumbnail.
Unused speculative displays remain 51,110 bytes alternating and 47,301 bytes
forward per engine. Selected optimized-video startup is 146.54 / 148.17 ms,
with zero original-video bytes, zero rebuffer events and one open. Selected
metadata reads 45,704 / 45,706 video bytes, with no further video body needed
for playback; this does not enable speculative video metadata.

All four memory cases retain five pages, desktop 124 tiles/330 observer targets
and mobile 71/193. Chromium heap max/min is 1.0181 desktop and 1.0040 mobile;
fitted growth is 0.179% and 0.050% of each mean per window. All unchanged limits
pass. WebKit heap and long-task metrics remain unavailable; these are settled
convergence observations, not complete browser-process memory caps.

## Pre-layer measured browser results (final combined correction)

The first final-correction bundle passed **80/80** native media cases in 6.8
minutes, including original-only 900px and 320px PNGs in both engines. The
compiler used production React/Vite; the owned APIs remained development,
fake-email and no-mail. `tmp/media-loading/final-fix/production-inventory-native.json`
records 390 standard artifacts and all changed/deleted source paths against
`c36e3c7ba99bf31b48e564e6b46dc5ad37c34e6c`, with binary-diff SHA256
`ce2b7c117f6f72fe9230b9509d4700f208f3d1e1e0cdf71d87c75cef65d643f3` and
individual changed/new file hashes. The final local commit and later verification
are recorded in the final-fix report; this documentation update does not change
the measured product. Subsequent ordinary acceptance exposed a CSS cascade
reversal after shared component stylesheet extraction. The entry now imports
Mantine defaults in their supplied CSS layer; the figures in this section
remain the preserved pre-layer observations. The completed whole-branch review found two important
and eight consolidated minor issues; scoped rereview of the correction remains
pending.

The immutable run snapshot is `tmp/media-loading/final-fix/cache-raw.json`;
`measurements.json` beside it records ten raw artifact hashes and the same
median/nearest-rank p95 derivation. Cache observations were recorded at
19:51:13.762Z and 19:54:17.423Z on October 15, 2026. No protocol threshold,
timeout or retry was relaxed. These are standalone local observations, with
no matched production latency speedup claim.

| Observation                                                    |        Chromium |           WebKit |
| -------------------------------------------------------------- | --------------: | ---------------: |
| Cold first image                                               |       134.20 ms |        225.56 ms |
| Original rapid navigation p50 / p95                            | 66.16 /79.89 ms | 66.88 /465.39 ms |
| Ordinary warm reload                                           |        75.70 ms |        112.79 ms |
| Ordinary reload body bytes                                     |               0 |                0 |
| Alternating two-item navigation p50 / p95                      | 59.52 /66.83 ms |  45.48 /59.76 ms |
| Alternating selected display / all-media bytes                 |        0 /3,809 |         0 /3,809 |
| Thirty distinct forward moves p50 / p95                        | 58.31 /63.08 ms |  44.38 /60.05 ms |
| Forward new selected body bytes after completed native warming |               0 |                0 |

WebKit rapid p95 is **465.39 ms**, compared with the historical round1
89.07 ms. Zero-based samples 2, 3, 5 and 9 were 846.66, 338.86, 465.39 and
179.76 ms. The retained request/transfer records contain ordering and byte counts,
not timestamps correlated to each move. No photo object body repeated during
that navigation scenario; WebKit long-task observation is unavailable. These
records do not establish the cause of the slower tail or a matched production
regression. No preferred-result rerun replaced it. Each original scenario
records 62 selections and 62 actual opens; each dwell scenario records 31 of each.
Unused photo speculation remains counted: 51,110 bytes alternating and 47,301
bytes forward in each engine. Selected optimized-video playback records zero
original-video bytes, zero rebuffer events and one actual open. This does not
enable speculative video metadata.

All four settled-memory cases retain five pages. Desktop windows settle at 124
tiles/330 observed targets and mobile windows at 71/193. Chromium heap
max/min ratios are 1.0175 desktop and 1.0053 mobile, with fitted slopes 0.205%
and 0.075% of the respective mean per window. WebKit heap and unsupported
long-task metrics remain unavailable. These are convergence observations, not
native-process hard memory caps. Historical results below retain their exact
older source identities.

## Historical measured browser results (round1)

Round1 media acceptance passed **76/76** cases in 6.8 minutes after the completed
native-image handoff, pending-filter, committed-anchor, logical video-seek and
round1 explicit-pause ownership corrections. The standard browser bundle was explicitly
compiled with `NODE_ENV=production`; the API remained development/fake-email
with no-mail injection. `task18-r1-production-inventory.json` records
all 361 standard-dist artifacts, source revision and dirty state, dependency
versions and direct production React assertions. The source revision was
`46a940681ace5f352a7ec931a0e1f01301eef333` plus the recorded round1 diff, on macOS
arm64, Node 24.19.0, React 19.3.0, Vite 8.3.1, Chromium 153.0.8010.12 and
WebKit 26.6.

That measured product source was committed as
`529317f751bc5ce56a529e1de8bb185487619b68`. The subsequent round2 correction routes
focused Enter/Space activation through the existing playback intent and readiness
owner; round3 adds disabled-command admission at that same boundary. Their
affected acceptance is recorded separately below; the timings, bytes,
memory and compression observations here retain their round1 bundle identity.

Each navigation row contains 30 observations. p50 is the median and p95 the
nearest rank. Cold/reload/startup values are single observations. Readiness
requires the actual destination's current chosen image to decode. The original
rapid scenario, alternating cache revisits and distinct forward consumption are
separate protocols and their timing distributions are not pooled.

| Observation                                                      |         Chromium |           WebKit |
| ---------------------------------------------------------------- | ---------------: | ---------------: |
| Cold first image                                                 |        132.19 ms |        206.88 ms |
| Original rapid next-photo p50 / p95                              | 66.40 / 78.73 ms | 57.89 / 89.07 ms |
| Ordinary warm reload                                             |         75.09 ms |        119.16 ms |
| Ordinary reload body bytes                                       |            **0** |            **0** |
| Original scenario video startup                                  |        138.03 ms |        164.51 ms |
| Alternating two-item warm-cache p50 / p95                        | 60.89 / 67.11 ms | 45.78 / 55.59 ms |
| Alternating selected display / all-media bytes                   |        0 / 3,809 |        0 / 3,809 |
| Distinct forward completed-native p50 / p95                      | 58.35 / 78.59 ms | 40.86 / 52.79 ms |
| New bytes for all selected representations over 30 forward moves |            **0** |            **0** |
| Maximum viewer media nodes                                       |                7 |                7 |
| Observed long tasks                                              | 0, API supported |  API unavailable |
| Timeline media nodes after six continuations                     |              102 |              102 |

Chromium's genuine CDP `ignoreCache` reload measured 85.62 ms and zero recorded
media bodies. WebKit's separate fresh-context visit took 383.37 ms and
transferred 25,555 bytes (thumbnail plus display); it is not a hard-reload
substitute. Long-task observation covers the main thread, not worker CPU or all
native decoding.

### Navigation bodies and bookkeeping

The original scenario recorded exactly 62 opens from 62 selections per engine:
62 bootstrap reads, 62 actual-detail reads, 32 neighbor-preview POSTs, one
settings read and one video-reaction read. Its media ledger contains 65
transfers/574,660 B in Chromium and 66/574,662 B in WebKit. Required authorization
and bookkeeping traffic remains separate from media-body reuse.

The distinct-forward scenario selects 31 different photos. Before each move it
waits the explicit 300 ms dwell and independently observes a live, successfully
completed native decode of the exact future image. Extra precondition waits were
3.19–9.08 ms in Chromium and 3.25–16.50 ms in WebKit; actual total dwell was
305.47–314.72 / 304.70–318.14 ms. These waits are recorded, not hidden pacing.
All 30 completed-native selections added zero bytes for every representation,
including thumbnails, and zero post-selection bytes from already-active target
requests. The current selected node still had to decode before readiness.

Each engine recorded 31 opens, 31 bootstrap reads, 31 actual-detail reads,
31 neighbor-preview POSTs and one settings read. Final body accounting was:

| Forward body category                         | Bytes per engine |
| --------------------------------------------- | ---------------: |
| Initial cold display                          |            3,809 |
| Consumed prefetched displays                  |          383,325 |
| Unconsumed prefetched displays                |           47,301 |
| Initial thumbnail                             |            3,809 |
| **All media, 35 requests**                    |      **438,244** |
| Speculative original or optimized-video bytes |            **0** |
| Page-close cleanup bytes                      |            **0** |

Final item1040 had no thumbnail request. The ledger was fully drained, with zero
active requests, another full quiet dwell, then page-close settlement. The
unconsumed displays can serve later selections; they are still counted as unused
within this scenario. The pre-correction fully drained RED transferred 552,514 B,
including all 30 later selected thumbnails (114,270 B). Its evidence remains
separate from the older immediate snapshot of 544,896 B, which missed final work.

The alternating scenario uses two photos and exactly 31 opens. Its first future
photo has a completed native handoff and adds zero bytes. After reversing, the
second visit to that photo needs one 3,809 B thumbnail because the single retained
decoded owner now follows the opposite direction. Every display body remains
zero on selection; HTTP warmth alone is not a guarantee of zero new thumbnail
bytes. Its first cold display is 3,809 B, consumed prefetched display is 21,746 B,
and unconsumed displays total 51,110 B. Eight media requests total 84,283 B.
It makes 31 bootstrap, 31 detail, three neighbor-preview and one settings request.
The raw ledger bounds request starts by the next selection watermark, so this
one later thumbnail is counted once, not against earlier visits to the same ID.
Terminal bytes and already-active request chunks remain accounted for after
those boundaries. No original/video speculation or cleanup bytes occurred.
Alternating precondition waits were 2.03–6.46 ms in Chromium and 1.84–4.98 ms
in WebKit; actual dwell ranged 304.00–308.46 / 303.32–308.05 ms. The earlier
R102 WebKit outlier remains preserved separately: 115.51 ms navigation p95,
163.37 ms maximum precondition wait and 519.13 ms maximum actual dwell. The new
round1 measurements were required after a product correction; they do not
replace or discard that earlier pacing observation.

The internal-entry case records exactly 11 opens from 11 actual SPA selections;
hover and safe previews add none. Overscan-only seen delta remains zero, including
the long timeline and expanded-burst flows.

Selected optimized video remains paused at time zero with `preload="metadata"`
before Play. The ten-second fixture completed with zero rebuffer events, zero
original bytes and one open. Startup was 132.81 ms / 153.60 ms. Native metadata
loading read the full small optimized fixture: 45,704 / 45,706 video bytes,
including WebKit's two-byte range probe. Playback added no further video bytes;
poster and neighboring photo bodies bring final totals to 92,266 / 92,268 B.
This selected-player observation does not qualify speculative metadata or
first-segment loading; both remain disabled.

Round1 raw results are under `tmp/media-loading/task18-media-r1-final/`.
`task18-r1-cache-raw.json` freezes the cache observations at
16:56:53.437Z and 16:59:58.544Z on October 15, 2026 before ordinary acceptance
can append other runs. `task18-r1-measurements.json` records derived
metrics, raw hashes and API counts. The pre-round1 R102 run remains unchanged
in `task18-media-r102-final/`, `task18-r102-cache-raw.json` and
`task18-r102-measurements.json`, tied to the committed `46a94068` source.
The preceding successful 76-case run remains
unchanged in `task18-media-current-final/`, `task18-current-cache-raw.json` and
`task18-current-measurements.json`; it predates the logical video-seek correction.
The earlier 72-case handoff run remains separately preserved in
`task18-media-final-handoff/`, `task18-handoff-final-cache-raw.json` and
`task18-handoff-final-measurements.json`; it predates the later filter and timeline
corrections. Earlier 70-case results and display-only forward measurements remain
in their original `task18-final-*` artifacts;
failed attempts and frozen M1 are never overwritten. The reported body counts
are local server response writes, not production billing or packet captures.

### Equivalent-position retained memory

The final protocol samples every exact response 6 through 22 of a 10,000-item
catalog. Each sample aligns the newest page's first day to the same attainable
native scroll coordinate, then verifies request/seen completion, visible-image
readiness, animation settlement and at least 600 ms intersection quiet before GC.
Exact final windows 15 through 22 retain five pages. Earlier uncontrolled-position
mobile samples cycled through different row counts; their failed raw is retained
and no cross-protocol memory improvement is claimed.

| Engine / width | Exact day top | Tiles / observer targets |           JS heap range |     Max/min | Fitted growth per window |
| -------------- | ------------: | -----------------------: | ----------------------: | ----------: | -----------------------: |
| Chromium 1280  |       99.5 px |                124 / 330 | 24,005,480–24,322,276 B |     1.01320 |         0.05092% of mean |
| Chromium 390   |     99.625 px |                 71 / 193 | 23,470,936–23,580,188 B |     1.00465 |         0.06507% of mean |
| WebKit 1280    |       99.5 px |                124 / 330 |             Unavailable | Unavailable |              Unavailable |
| WebKit 390     |    100.375 px |                 71 / 193 |             Unavailable | Unavailable |              Unavailable |

Unchanged limits are heap max/min at most 1.10 and fitted growth at most 1% of
mean per window, exact tile/observer equality, at most five pages and 200 tiles,
one document, listener range at most one and DOM-node max/min at most 1.10.
Chromium desktop had 7,300–7,336 DOM nodes and 1,254–1,255 listeners; mobile had
5,087 nodes and 1,042 listeners. Embedder heap was 12,983,000–13,545,096 B and
backing storage 3,061,169–3,077,435 B on desktop; mobile ranges were
12,035,328–12,582,480 B and 2,984,139–2,984,637 B. Separate counters are not added
into process RAM. Finite convergence does not exclude a slower leak or establish
a hard browser heap cap. Independent two-pixel anchor/focus/Back/resize tests
also passed without changing their thresholds.

## Signing and native codec observations

The isolated current-source signer benchmark used 1,000 fixed synthetic keys,
loopback configuration and fake credentials, with no HTTP calls. Both phases used
a fixed clock inside the reusable one-hour lease, the 10,000-entry LRU, 60-second
renewal margin and seven-day private freshness. Node was 24.19.0 and the AWS SDK
was 3.1140.0. These are single sequential process-phase totals, including loop and
policy assertions, not serving per-request CPU or a production load test.

| Phase                 | Lease requests | Actual signatures |  Wall time |   User CPU | System CPU |
| --------------------- | -------------: | ----------------: | ---------: | ---------: | ---------: |
| Cold distinct keys    |          1,000 |             1,000 | 123.169 ms | 183.746 ms |   6.006 ms |
| Identical warm repeat |          1,000 |                 0 |   2.906 ms |   2.975 ms |   0.056 ms |

`tmp/media-loading/task18-signing-measurement.json` records source hashes,
revision, versions, policy assertions and raw phase totals.

A separate native recipe observation ran the unchanged committed `oriented.jpg`
and `audio.mp4` through the existing verification-only runner on macOS 25.3.0,
arm64. `/usr/bin/time -l` reported a 203,325,440-byte maximum resident set for the
photo child and a maximum 206,684,160 bytes among the five video recipe children.
The separately sampled Node orchestrator peaked at 111,935,488 bytes. These
nonconcurrent peaks are not added. The preliminary video metadata probe is outside
those wrapped recipe children. Small fixtures and native process RSS do not prove
large-input maxima, cgroup isolation, 256 MiB job qualification or the 512 MiB
serving envelope.

`tmp/media-loading/task18-processing-memory/evidence.json` retains exact wrapper
and child commands, elapsed times, time stderr and units, input/output identities,
geometry and hashes. Its owned output files remain available for review. Neither
measurement enables the production processing runtime or changes its fail-closed
prerequisites.

## SQL row-work evidence

The pre-index helper measured 84 correctness-checked sparse/dense scenarios at
1k, 10k and 50k items. Fixed 11/12 statement counts do not bound SQLite row work.
The subsequent 252-condition A/B/A experiment kept exact SQL and response
digests unchanged. At 50k dense viewer ownership, a narrow date window measured
8.010 ms median before, 1.175 ms with `(uploaded_by,captured_on)`, and 8.026 ms
after dropping that index again. Active pages increased about 2.66 MiB; write
cost was not measured. Migration 0018 adopts that index and retains the old
indexes and authorization/query semantics.

Dense head grouping still scales with eligible rows, and the admin filtered
cursor can seek a looser date bound before applying its residual cursor. Neither
limitation is hidden by an index-name or fixed-query-count claim. Raw plans,
bytecode, response digests and timings live in `task18-sql-final.json` and
`task18-sql-index-report.md` under `tmp/media-loading/`. Replay the A/B/A benchmark
at its recorded pre-adoption BASE, not a catalog already migrated to 0018.

## Round1 static representations

The measured round1 standard build contains 121 eligible HTML, JavaScript, CSS, JSON and
SVG files totaling 2,238,397 identity bytes. Their Brotli representations total
570,256 bytes, a 74.52% reduction; gzip totals 655,759 bytes, a 70.70% reduction.
The separate upload-harness build has 127 eligible files: 2,267,778 identity bytes,
581,772 Brotli bytes (74.35% reduction), and 669,371 gzip bytes (70.48%).
`tmp/media-loading/task18-r1-compression.json` records every file hash and
size. Each sidecar was decompressed and compared with its exact identity bytes;
files without a smaller sidecar count their identity size.

These are same-content eligible-text savings, not whole-build savings or measured
latency improvements. The historical C5 74.53% observation remains separately
recorded. The round1 built-output static test passed all 28 cases, including
entry and worker representation validators. Deployed packaging remains unverified.

## Historical local verification (round3)

The round3 disabled-control correction passed `pnpm check`: **5,048 tests** and
all formatting, lint, types and build phases. Seven server tests remain explicitly
gated: three delegated Linux runtime cases, three Docker HDR codec cases and
one opt-in built-static case. The latter separately passed in the round1
28-case actual built-output check. These gates do not establish cgroup qualification.

Current affected acceptance passed **80 focused unit/integration tests**, eight
native keyboard/retry cases, the complete **40-case video suite**, and all ten
native media-renewal cases across Chromium and WebKit. Actual focused Enter and
Space commands now share pointer playback's explicit-intent/readiness owner;
renewal cannot override a later keyboard pause or cause duplicate play activation.
The disabled error-state toolbar now rejects Enter, Space and pointer input
before intent selection or lease/readiness work. The pointer weakness predates
round2; the new keyboard bypass and its pointer analogue share one admission fix.
Native checks retain zero play attempts and one renewal until the actual Try again
action recovers playback. Enabled-control observers still delegate native play
unchanged and verify single activation, real clock advancement and retained focus.

These round3 results use BASE `dc3e56ba193a447a80d02a44a2b7542ef1cb7511` plus the
recorded disabled-admission correction. Round2's 77/6/40/10 affected checks and
5,045-test workspace result retain that BASE identity. The 76-case media measurements, eight
native upload-barrier cases, both actual reopen cases plus five prerequisites,
static representation bytes and 5,033-test round1 check remain tied to
`529317f751bc5ce56a529e1de8bb185487619b68`, not the new bundle. They were not automatically repeated for keyboard command
routing. No upload, prefetch, selection or measurement protocol changed.

The complete ordinary run remains **370 passed and one existing fixme** at
pre-round1 commit `46a940681ace5f352a7ec931a0e1f01301eef333`; it was not rerun
for these narrow review fixes. Its actual 264-file batches, expiry flows and
included admin/upload surfaces retain that exact source qualification. Earlier
full admin118/118 and upload89/89 runs also remain historical evidence.

Two failed round1 video runs remain retained. One exposed a popover cleanup
race, corrected by waiting for the exact owned dialog and its closure. The other
stalled during an early WebKit reload before playback assertions. An independent
immediate-reload probe recovered through a new document and bootstrap; the
original provisional-navigation stall remains unexplained and unreproduced.
The seek fixture now requires the initial viewer to mount before seeding/reload;
this is a setup precondition, not a claimed early-refresh product fix. No timeout,
retry or threshold was relaxed. Independent review must disposition that residual.

Definitive round3 logs under `tmp/media-loading/` are
`task18-check-r3-final.log`, `task18-r3-video-focused-complete.log`,
`task18-r3-video-keyboard-retry.log`, `task18-r3-video-current.log` and
`task18-r3-media-renewal.log`. The separate production inventory is
`task18-r3-production-inventory.json`; its 361 standard artifacts match the
post-check `task18-r3-final-production-inventory.json`. The compiler explicitly
used production React/Vite while actual API configuration stayed development,
fake-email and no-mail. The round3 final source/preservation inventories record
exact changed paths and retained historical hashes. There is no round3 timing or
compression claim. All round2 logs and inventories remain unchanged, including
`task18-check-r2-final.log` and `task18-r2-final-production-inventory.json`.

Retained round1 logs include `task18-media-r1-final.log`,
`task18-r1-upload-barrier-typed.log`, `task18-r1-reopen-final.log`,
`task18-static-r1-built.log` and `task18-check-r1-final.log`. Their measured/final
bundle identities remain in `task18-r1-production-inventory.json` and
`task18-r1-final-production-inventory.json`. The prior complete ordinary log is
`task18-ordinary-r102-final.log`. The whole-branch review subsequently completed against
`c36e3c7ba99bf31b48e564e6b46dc5ad37c34e6c`. It found two important issues and
eight consolidated minor issues. The combined final correction covers
original-only PNG selection and bounded AVIF capability publication, crash-safe
cgroup ownership, accessible media status, paused decode admission, current
docs, stronger assertions, module/suite decomposition, conventions and the
Vite config import. Its exact source and fresh verification are indexed in
`.superpowers/sdd/2026-10-14-media-loading/final-fix-report.md`; the scoped
rereview of those corrections is pending. Historical timings above remain
at their recorded source identities and are not promoted to a new speedup claim.

## Operating limits and decisions

- Metadata-video speculation and first-segment speculation remain disabled.
  Selected video metadata loading and playback are separate native-player checks.
- Automatic processing remains disabled when delegated cgroup prerequisites
  fail. Native codec output and process RSS observations do not establish the
  OS-enforced 256 MiB job limit, 128 MiB serving reserve or 512 MiB deployment
  envelope. The local cgroup/deployment qualification remains unverified.
- WebKit has no portable genuine hard-reload or CDP heap API in this harness.
  Its fresh browser-context visit is separately labeled. Chromium JS heap and
  DOM counters exclude complete browser/native/worker memory.
- Browser cache eviction and a renewed signature can require a new body. Stable
  leases and seven-day private immutable freshness do not promise persistent
  offline availability or shared-cache access.
- Physical iPhone decoding, actual B2 signatures/Range/cache responses, deployed
  static compression packaging and a remote cold-versus-warm machine comparison
  remain manual checks. No infrastructure setting changed.

`FLY_MIN_MACHINES_RUNNING=1` remains an optional warm-machine choice. Measure a
remaining cold deep-link discovery waterfall before considering Start; measure
geographic/renewal misses before a CDN; measure remaining video startup and
rebuffering before HLS. Current local evidence does not justify those changes.
