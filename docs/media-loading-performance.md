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

## Controlled current browser results

Current media acceptance passed **76/76** cases in 6.7 minutes after the completed
native-image handoff, pending-filter, committed-anchor and logical video-seek corrections. The standard browser bundle was explicitly
compiled with `NODE_ENV=production`; the API remained development/fake-email
with no-mail injection. `task18-r102-production-inventory.json` records
all 361 standard-dist artifacts, source revision and dirty state, dependency
versions and direct production React assertions. The source revision was
`da9b0fdf3073d07ee9307f968dd8a6bbc8b67161` plus the recorded M2 diff, on macOS
arm64, Node 24.19.0, React 19.3.0, Vite 8.3.1, Chromium 153.0.8010.12 and
WebKit 26.6.

Each navigation row contains 30 observations. p50 is the median and p95 the
nearest rank. Cold/reload/startup values are single observations. Readiness
requires the actual destination's current chosen image to decode. The original
rapid scenario, alternating cache revisits and distinct forward consumption are
separate protocols and their timing distributions are not pooled.

| Observation                                                      |         Chromium |            WebKit |
| ---------------------------------------------------------------- | ---------------: | ----------------: |
| Cold first image                                                 |        146.47 ms |         225.00 ms |
| Original rapid next-photo p50 / p95                              | 66.57 / 82.14 ms |  60.33 / 79.35 ms |
| Ordinary warm reload                                             |         76.46 ms |         110.37 ms |
| Ordinary reload body bytes                                       |            **0** |             **0** |
| Original scenario video startup                                  |        141.74 ms |         155.00 ms |
| Alternating two-item warm-cache p50 / p95                        | 56.61 / 65.44 ms | 45.56 / 115.51 ms |
| Alternating selected display / all-media bytes                   |        0 / 3,809 |         0 / 3,809 |
| Distinct forward completed-native p50 / p95                      | 57.35 / 69.66 ms |  44.66 / 50.76 ms |
| New bytes for all selected representations over 30 forward moves |            **0** |             **0** |
| Maximum viewer media nodes                                       |                7 |                 7 |
| Observed long tasks                                              | 0, API supported |   API unavailable |
| Timeline media nodes after six continuations                     |              102 |               102 |

Chromium's genuine CDP `ignoreCache` reload measured 88.64 ms and zero recorded
media bodies. WebKit's separate fresh-context visit took 358.06 ms and
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
3.39–9.42 ms in Chromium and 3.06–7.46 ms in WebKit; actual total dwell was
304.96–312.06 / 304.42–318.53 ms. These waits are recorded, not hidden pacing.
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
Alternating precondition waits were 1.93–4.33 ms in Chromium and 1.91–163.37 ms
in WebKit; actual dwell ranged 303.19–307.33 / 303.46–519.13 ms. The WebKit
outlier and 115.51 ms navigation p95 remain in the results, without extra pacing
or a rerun to replace them.

The internal-entry case records exactly 11 opens from 11 actual SPA selections;
hover and safe previews add none. Overscan-only seen delta remains zero, including
the long timeline and expanded-burst flows.

Selected optimized video remains paused at time zero with `preload="metadata"`
before Play. The ten-second fixture completed with zero rebuffer events, zero
original bytes and one open. Startup was 131.14 ms / 47.91 ms. Native metadata
loading read the full small optimized fixture: 45,704 / 45,706 video bytes,
including WebKit's two-byte range probe. Playback added no further video bytes;
poster and neighboring photo bodies bring final totals to 92,266 / 92,268 B.
This selected-player observation does not qualify speculative metadata or
first-segment loading; both remain disabled.

Current raw results are under `tmp/media-loading/task18-media-r102-final/`.
`task18-r102-cache-raw.json` freezes the cache observations at
15:27:47.538Z and 15:30:47.989Z on October 15, 2026 before ordinary acceptance
can append other runs. `task18-r102-measurements.json` records derived
metrics, raw hashes and API counts. The preceding successful 76-case run remains
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
| Chromium 1280  |       99.5 px |                124 / 330 | 23,981,676–24,424,460 B |     1.01846 |         0.19237% of mean |
| Chromium 390   |     99.625 px |                 71 / 193 | 23,463,116–23,574,112 B |     1.00473 |         0.06701% of mean |
| WebKit 1280    |       99.5 px |                124 / 330 |             Unavailable | Unavailable |              Unavailable |
| WebKit 390     |    100.375 px |                 71 / 193 |             Unavailable | Unavailable |              Unavailable |

Unchanged limits are heap max/min at most 1.10 and fitted growth at most 1% of
mean per window, exact tile/observer equality, at most five pages and 200 tiles,
one document, listener range at most one and DOM-node max/min at most 1.10.
Chromium desktop had 7,300–7,336 DOM nodes and 1,254–1,255 listeners; mobile had
5,087 nodes and 1,042 listeners. Embedder heap was 12,953,448–13,680,328 B and
backing storage 3,060,021–3,086,359 B on desktop; mobile ranges were
11,996,552–12,585,720 B and 2,981,243–2,991,933 B. Separate counters are not added
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

## Current static representations

The current standard build contains 121 eligible HTML, JavaScript, CSS, JSON and
SVG files totaling 2,237,893 identity bytes. Their Brotli representations total
570,014 bytes, a 74.53% reduction; gzip totals 655,499 bytes, a 70.71% reduction.
The separate upload-harness build has 127 eligible files: 2,267,274 identity bytes,
581,485 Brotli bytes (74.35% reduction), and 669,160 gzip bytes (70.49%).
`tmp/media-loading/task18-r102-compression.json` records every file hash and
size. Each sidecar was decompressed and compared with its exact identity bytes;
files without a smaller sidecar count their identity size.

These are same-content eligible-text savings, not whole-build savings or measured
latency improvements. The historical C5 74.53% observation remains separately
recorded. The current built-output static test passed all 28 cases, including
entry and worker representation validators. Deployed packaging remains unverified.

## Final local verification

The final unchanged product/test tree passed `pnpm check`: 5,025 tests and all
formatting, lint, types and build phases. Seven server tests remain explicitly
gated: three delegated Linux runtime cases, three Docker HDR codec cases and
one opt-in built-static case. The latter separately passed in the 28-case actual
built-output check. These gates do not establish cgroup qualification.

The complete ordinary browser run passed 370 cases in 19.9 minutes, with one
existing uploader-directory fixme skipped. Both actual 264-file mixed batches,
both expired-browser reauthentication flows, upload recovery, current admin
surfaces and the original source-less video keyboard comment case passed. No
new skip or retry was added. The separate current media and video suites passed
76/76 and 40/40. Earlier full admin118/118 and upload89/89 runs remain historical
acceptance evidence; the ordinary run exercises their current included files.

Definitive logs under `tmp/media-loading/` are `task18-check-r102-final.log`,
`task18-ordinary-r102-final.log`, `task18-media-r102-final.log`,
`task18-video-r102-green.log` and `task18-static-r102-built.log`. Final standard
and upload-harness bundle identities are in
`task18-r102-final-production-inventory.json`; all standard files match the
measured R102 inventory. Documentation status and artifact reconciliation
followed these checks without changing product or test source. Independent M2
and whole-branch reviews remain pending.

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
