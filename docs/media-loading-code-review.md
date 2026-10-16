# Media loading code review

Avandar Auto review of `feat/media-loading`, completed on 15 October 2026.
The review started at `4b8419791c08825845f7f9e956fa402dc51e412c`, compared
with `main` at merge-base `1ec228b094f65e743f7b285b1d1843f410407882`.
Review fixes remain in the worktree for inspection. No commit, push, pull
request, merge, deployment, or production mutation was performed.

## Scope and implementation

Nine review lanes examined the eligible branch diff: common checks, comments
and modules, TypeScript, types, functional style, React, hooks, CSS modules,
and tests. The initial review produced 168 finding groups, including overlapping
and refuted occurrences. Verified findings and additional issues encountered
while fixing and validating them were addressed. Generated files, migrations
outside the diff, and unavailable library-specific checks were excluded.

The media implementation retains stable signed viewing URLs, private browser
caching, two-ahead/one-behind prefetching, bounded speculative bytes and decode
work, video-poster warming, foreground handoff, renewable leases, bounded
virtualized timelines, compressed static assets, and isolated derivative
processing. TanStack Router remains appropriate: a switch to Start would not
fix the private media URL/cache identity or decoding costs addressed here.
See [media loading](media-loading.md) and the qualified
[performance evidence](media-loading-performance.md).

## Review fixes

| Area                           | What changed and why                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts and state            | Object arguments, explicit return contracts, readonly inputs, descriptive names, and narrower types make ownership and call sites explicit. Browser and catalog boundary nulls remain intact. Known-head timeline cursors retain an explicit marker so legacy seed fallback cannot replace a known head. |
| Resource ownership             | Media lifetime, prefetch accounting, range-reader shutdown, burst state, application background work, and schema expectations have coherent module boundaries. Cancellation, admission, expiry, and shutdown order are preserved.                                                                        |
| Components and CSS             | Print, photos, video controls, reactions, and conversation components own their styles. Parent layout, hover relationships, portals, focus, responsive sizing, and decoded element lifetimes are preserved.                                                                                              |
| Test boundaries                | Upload forms use controlled controller snapshots; controller tests own manifest refresh and retry contracts. Account mutations and bootstrap recovery are tested separately. Shared fixtures remove repeated provider and navigation setup.                                                              |
| Browser evidence               | Visibility changes are driven through another member's UI after warming. Upload declaration, cancellation, refused files, and navigation use real browser flows. Native-image harness imports now carry the actual function type.                                                                        |
| Organization and documentation | Module names, companion files, tests, comments, and documentation follow the review conventions. Oversized modules and suites were split without dropping test cases or assertions.                                                                                                                      |

## Verification

Final validation covers the completed implementation. Unit tests were selected
for affected behavior; the full unscoped repository suite was not run.

| Check                                   | Result                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Changed-file formatting                 | Passed across 819 changed files                                                                                            |
| Repository lint and types               | Passed, zero errors                                                                                                        |
| Production build                        | Passed                                                                                                                     |
| Focused web tests                       | 1,435 passed across 219 files                                                                                              |
| Focused server tests                    | 632 passed, 7 environment-gated skips across 95 files                                                                      |
| Shared contracts and test support       | 310 shared-contract tests and 78 support/tooling tests passed                                                              |
| Chromium and WebKit media regressions   | 79 passed; one synchronization race fixed, then all four restoration cases passed three times (12/12)                      |
| Chromium and WebKit video regressions   | 40 passed                                                                                                                  |
| Upload and uploader browser regressions | 12 passed initially; cancellation race corrected, then 8 passed including both cancellation cases and all 5 uploader cases |
| Independent review rechecks             | All nine review lanes reverified; no remaining confirmed findings                                                          |

The first media browser pass had 76 passing cases and four failures from two
harness calls still using the old positional signature. Both calls were fixed
and typed; all four Chromium/WebKit reruns passed. The latest-build full run
passed 79 cases and exposed a restoration-test race: an in-flight forward page
changed the retained boundary before the test scrolled backward. The trace
confirmed the application used the correct new reverse cursor with HTTP 200.
The test now waits for timeline reads and DOM publication away from paging
sentinels before capturing its exact cursor; all four cases passed three times.
The upload cancellation failure was also a test readiness race: the test now
waits for the visible declared-draft action before reading its session. All
original cursor, date-boundary, and cancellation assertions were retained.

The final structural check found no source files above the 400-line threshold
across 876 reviewed paths. All 25 final split destinations parse and resolve
their relative imports; all 26 new public declarations are documented.

The checks are local, with isolated catalogs, fake storage, and fake email.
No fresh production speedup claim is inferred from these regression runs.
Previously recorded timing and memory observations retain their original
source and environment qualifications.

## Verified exceptions

| Candidate                          | Why it was retained                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boundary `null` values             | HTTP DTOs, database records, DOM refs, and framework contracts require their documented representations. Owned application absence uses `undefined`. |
| Ordered loops and lifecycle guards | Streaming reads, cancellation, serial browser steps, and eligibility guards have observable ordering or lazy-evaluation requirements.                |
| Small-looking asynchronous helpers | Lazy execution and operation identity matter; inlining would change semantics or duplicate a meaningful boundary.                                    |
| Single-component test fixtures     | A hook-using component that is already the sole component in its file does not require another wrapper file.                                         |
| Re-export documentation            | Forwarded APIs retain the documentation on their original declarations.                                                                              |

Linux delegated-cgroup checks remain environment-gated on this macOS machine.
Real B2 behavior, physical iPhone decoding, deployment memory enforcement,
and remote-network performance remain outside the local verification described
here. The earlier performance report records these limits in detail.
