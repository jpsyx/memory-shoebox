# Step 8a verification and implementation decisions

Administration and setup were implemented on `feat/administration` in October 2026. This record keeps reviewable evidence after temporary execution logs are
removed. Automated evidence and final manual acceptance are distinct.

## Automated evidence

- `SETUP_CAPTURE=1 pnpm exec playwright test --config playwright.setup.config.ts`:
  initial HTTP run, 15 passed / 23 failed. Chromium integration worked apart
  from four Night contrast failures and a wrong test selector; WebKit also
  exposed HTTP Secure-cookie transport and native keyboard traversal.
- `pnpm exec playwright test --config playwright.setup.config.ts --project=setup-chrome e2e/setup/setup.states.spec.ts`:
  meaningful pre-fix Night RED, 1 failed. Go back and edit, Check email again,
  Add another person and Skip for now had active text contrast 1:1 on the sheet.
- The one screenshot confirmation run used the same first command: 26 passed /
  14 failed, with Chromium 20/20 and remaining WebKit HTTP cookie failures.
  The three affected setup components now use the existing print quiet variant.
- `pnpm exec playwright test --config playwright.setup.config.ts`: final HTTPS
  proof, 40/40 passed in Chromium and WebKit. No successful contract is mocked.
- `pnpm exec playwright test --config playwright.setup.config.ts e2e/setup/setup.states.spec.ts`:
  supplementary whole-draft validation, skip after failure and completion retry,
  6/6 passed after correcting a test button label. That fixture correction is
  not product RED. Already-working integration scenarios are passing coverage,
  not manufactured historical failures.
- `pnpm check`: exit 0; locked skills, formatting, lint, types, build and
  3,216 tests across 473 files passed.
- `pnpm test:e2e --project chromium`: initial launch refused an occupied
  fake-bucket port before any tests. Read-only checks subsequently found no
  listener on either port and no catalog lock. A justified retry reached
  79 passing tests, one stale exact accessible-name selector failure, and one
  parked skipped case. After the bounded selector repair, the exact same command passed 80/80
  runnable cases with one existing parked skipped case (53.9 s, exit 0).

The bounded final screenshot packet comprises creation and invitations, Day
and Night, at 390×844, 768×1024, 1280×900 and 640×450. Originals are in
`test-results/setup-review/`, copies in `.impeccable/review/setup/`. Every
named image was inspected. These are HTTP Chromium captures of the final UI;
HTTPS changed only the fixture transport afterward. 640×450 is a 200% viewport
layout equivalent, not browser zoom. The packet is evidence for desktop browser
reflow, not actual-phone or uncoached acceptance.

The one Impeccable detector invocation scanned the complete Setup directory,
root/setup/join route files and returned no findings. A mistakenly supplied
nonexistent top-level invitation route caused a missing-path warning: the actual
`apps/web/src/routes/_app/setup.invite.tsx` is an eight-line delegation to the
scanned SetupInvitations component, with no additional visual controls or CSS.
Its source was inspected separately; do not interpret the detector as having
scanned every route path. The fresh scoped Task 10 review approved the slice,
the shipped Impeccable finish disposition was ship, and the fresh documenter
completed the incumbent extension with no blocker or system writes. The final
whole-branch review found zero Critical and zero Important defects and selected
the six Minor groups below. The final fix scoped re-review remains a controller
gate; its outcome is not yet recorded.

The final fixture helper cleanup also passed the focused keyboard creation/skip
command in both browsers (2/2); scoped lint, root TypeScript, formatting and
diff checks passed. No broad passing suite was repeated merely for an aggregate
count.

## Consolidated final fix wave

The final whole-branch review covered the actual merge base `44ed9da` through
`4e314b4` (18 commits, 171 files), including all five focus areas and every
previously deferred observation. Its read-only findings selected exactly M1–M6
for one consolidated wave, with no confirmed product-path or privacy defect.
The final scoped re-review is pending; implementation checks do not substitute
for that independent controller-owned gate.

| Finding                           | Implemented correction                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1: group regression precision    | Same-cookie PUT restoration now proves `only` access returns and `except` access disappears. Item-ID token replacement preserves uploader, rule and totals; separate uploader and assignment cases remain. These assertions passed against existing behavior, so they are current coverage, not historical RED. |
| M2: owned test-resource lifecycle | Setup protects ownership from acquisition and attempts every ordered closure after earlier failures. Authority readiness rejects on early errors/exits, completion rejection is observed immediately, and the parent awaits every child exit before catalog closure/removal.                                    |
| M3: main-export filenames         | Observation modules are `getActivityDetailFromEvent.ts` and `getActivityFamilyFromKind.ts`; the origin module is `requireSetupServingOrigin.ts`. Imports, the existing family test name and current module docs match. Historical paths in older evidence and Rulings remain historical.                        |
| M4: exact convention corrections  | Only named helper declarations, object inputs, query return types, synchronous collection operations and test braces changed. AST comparison confirms retained statements in six reordered modules are identical. Awaited SQLite writes and timezone batches remain sequential.                                 |
| M5: scoped documentation          | The seven-kind email inventory, delivered setup configuration prose, administration index entry and actual Setup/API layout modules now reflect the delivered slice.                                                                                                                                            |
| M6: observable test claims        | Function/literal adapter tautologies were removed. Actual QueryClient writes prove admin and picker caches retain separate shapes. The stale losing browser form has a distinct name, and a read-only setting assertion proves the winner's name remains.                                                       |

Lifecycle TDD used a behavior-preserving extraction of the original test helpers
before writing/running the failure checks. The command
`pnpm --filter @memory-shoebox/server test test/routes/setupFixtureLifecycle.test.ts test/routes/memberAuthorityWorker.test.ts`
then produced eight expected failures and two passing controls: missing cleanup
after app/assertion acquisition failure, skipped later closures after four
teardown failures, pending readiness after an actual corrupt-catalog child exit,
and shutdown returning before child exit. After the lifecycle change the same
command passed 10/10. The worker test/helper subsequently moved to the canonical
collection directory listed below; those earlier command paths remain historical.

New focused checks and actual outcomes:

- The affected server command covering group access/deletion, member authority,
  invitations/suggestions, lapse, retained-mail repair, activity/viewers and
  setup/race/rollback/lifecycle passed 134 tests in 15 files. Two requested path
  selectors (`members.test.ts`, `settings.test.ts`) matched no file; the actual
  member directory and administrative settings read/write suites were then run
  explicitly and passed 32 tests in three files.
- Setup UI and adapters passed 27 tests in two files. The strengthened cache
  test's initial incomplete DTO fixtures caused TypeScript errors and stopped
  the first browser invocation before browser execution. Complete typed shapes
  corrected that test-only error; it is not product RED.
- After the final worker directory/ownership amendment,
  `pnpm --filter @memory-shoebox/server test test/routes/memberAuthority.test.ts test/routes/memberAuthorityWorkerHelpers/memberAuthorityWorkerHelpers.test.ts`
  passed 13 tests in two files, including both separate-process authority races
  and the early-exit/awaited-shutdown checks.
- `pnpm exec playwright test --config playwright.setup.config.ts e2e/setup/setup.spec.ts --grep 'stale second setup tab|creation, email review/back and skip'`
  passed four HTTPS cases across Chromium and WebKit (8.1 s): the winner-setting
  assertion and creation/review/back/skip fixture smoke in both engines.
- `pnpm check` on the final production/test source passed locked skills,
  formatting, lint, types, all builds and 3,226 tests across 475 files, exit 0
  (root 142/21, prototypes 9/2, shared 284/19, emails 52/9, web 1,051/158,
  server 1,688/266). Earlier check attempts stopped at lint before types/build/
  unit execution: concise mock/helper arrows and one complex array annotation
  violated repository rules. The scoped automatic fix left two nested mock
  arrows; those were corrected manually and `pnpm lint` passed before the final
  complete check. These are test-helper convention repairs, not product RED.
  Only the final attempt executed the complete unit suite.

The production web UI files and visual bytes remain unchanged. No screenshots,
detector invocation, broad browser repetition or high-count loops were added.
The earlier 16-image HTTP Chromium confirmation packet and the single detector
run with its partial-path warning retain their stated limits.

### Retained final-review dispositions

| Observation                                                        | Retained disposition                                                                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1 complete admin/group DTO assertions                         | Already fixed in the shared administration suite; no final-wave change.                                                                       |
| Architecture seven-kind/nine-message inventory                     | Already corrected and independently corroborated; no final-wave change.                                                                       |
| Large mail-health and setup route suites                           | Retained coherent single-contract suites (436 and 646 lines) with a documented size/convention exception, per Ruling 17. No mechanical split. |
| Task 5 partial historical RED; Task 9 fixture chronology           | Explicit historical qualifications remain; current strengthened assertions cannot reconstruct pre-implementation evidence.                    |
| jsdom scrollTo, route discovery, bundle/libheif and color warnings | Known baseline/tooling diagnostics retained. No pristine-output claim or warning cleanup.                                                     |
| PRODUCT/DESIGN/sidecar drift                                       | Pre-existing and outside this ordinary incumbent extension. No system repair, recapture or scan.                                              |
| Presence timezone universality                                     | The six-hour probe assumption remains a practical limitation, not exhaustive historical/future IANA proof.                                    |
| Live/manual, actual zoom, provider and step 7b acceptance          | User-deferred acceptance remains open; no automated result claims it. The parked picker case and admin placeholders remain unchanged.         |
| Integration/publication                                            | Requires a separate user instruction; branch/worktree remain available for review.                                                            |

### Final-wave supporting scope

- `e2e/setup/runSetupCatalog.ts`: dedicated owned-resource seam lets failure
  tests invoke the real fixture lifecycle without importing Playwright's runner.
- `apps/server/test/routes/setupFixtureLifecycle.test.ts`: focused acquisition,
  teardown, HTTPS-init and browser-callback rejection checks for that seam.
- `apps/server/test/routes/memberAuthorityWorkerHelpers/memberAuthorityWorkerHelpers.ts`
  and its companion `memberAuthorityWorkerHelpers.test.ts`: a bounded test-only
  collection splits process script/startup/completion responsibilities and
  reproduces early exit and awaited shutdown with actual child processes.
- `docs/administration.md` and `docs/setup.md`: canonical module discoverability
  and the new test-owned cleanup contract accompany the selected source changes.
- This lasting record carries all 17 current Rulings and costs, the broad review,
  selected fixes, historical failure qualifications and retained dispositions.
  The controller will append the actual final scoped-review verdict afterward.

## TDD history and practical limits

Tasks 1–9 report meaningful RED/GREEN for their product changes, with one
explicit historical exception: Task 5's initial access/deletion fixtures failed
on duplicate item sequence before testing the desired behavior. Initial
create/list and token RED were meaningful, but access/deletion did not have
observed pre-implementation behavioral RED. Later post-implementation mutation
checks and independent current-behavior review cannot repair that history.
Task 9's shared surface/account fixture repairs followed implementation, so
those supporting fixture fixes are not represented as feature RED. Its preload
and authority recovery fixes have separate observed behavioral RED/GREEN.
Task 10's product fix has the observed real-browser Night contrast RED/GREEN.

Presence discovers offsets on six-hour samples and refines detected transitions.
The tested repeated-midnight/date-crossing cases pass, but this practical scheme
is not exhaustive proof of every historical IANA transition, particularly
multiple offset transitions hidden inside a sample interval. Capture-time
ambiguity semantics remain separate.

Output retains known jsdom Window.scrollTo notices, route discovery warnings,
libheif browser externalization notices, large bundle warnings and Playwright
NO_COLOR/FORCE_COLOR notices. These are disclosed baseline/tooling diagnostics,
not claimed pristine output.

## Necessary supporting-file scope

- Shared invitation payload files/barrels/tests and `docs/shared.md`: Task 3
  supplied the missing runtime email contract consumed by queue and template.
- `packages/emails/test/distRuntimeImport.test.ts`: exhaustive runtime smoke
  inventory had to include the invitation template exports.
- `apps/server/src/activity/writeActivityEvent/writeActivityEvent.ts`: authority/group/settings writers
  needed this slice's actual audit subjects and kinds, with frozen labels.
- Shared observation schema/tests and binding activity/presence prose: Task 7
  admitted historical setting IDs, clarified removed identities and exact local
  dates; adjacent presence interval helpers keep batched reads bounded.
- `apps/server/test/setup/setupConcurrency.worker.ts`: Task 8's separate-process
  SQLite writer proof needs an owned worker and reliable readiness/closure.
- `apps/web/src/testing/surfaceHarness.tsx`,
  `apps/web/src/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures.tsx`
  and `apps/web/src/surfaces/SignIn/SignInCard/__tests__/SignInCard.fixtures.tsx`: Task 9's
  incumbent real-router consumers needed initialized setup/progress defaults.
- `getSetupRedirectFromNavigation.ts` and its test replace the plan's helper
  filename so its single runtime export and module name agree.
- Task 10 helpers in `e2e/setup/setup.build.ts`, `setup.actions.ts`,
  `makeSetupAssertionsFromPath.ts`, `createSetupHttpsProxy.ts`, and
  `setup.states.spec.ts` separate artifact build, browser actions, read-only
  catalog assertions, owned TLS termination and failure-state behavior.
- Task 10 `SetupEmailReview.tsx`, `SetupInvitationActions.tsx` and
  `SetupMailDiagnosis.tsx`: the observed Night contrast failure required the
  existing sheet-appropriate button variant, preserving the global theme.
- Task 10 `docs/server.md` and `docs/administration.md`: bounded corrections
  remove stale route-count and later-task capability statements.
- `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`: Task 2
  documented current provider-refusal diagnosis and retained history; Task 7
  recorded actual identity/privacy and local-date observation semantics.
- Task 10 `e2e/item/item.uploader.spec.ts`: its exact option selector now includes
  the real admin-directory role label, preserving visibility save/undo checks.
  This is an integration-selector repair, not a product change or feature RED.
  The parked full-picker case stays skipped.
- This lasting record and the plan index status are authorized completion docs.

## Deferred final acceptance

Step 7b's live bucket, physical-device, uncoached and integrated live acceptance
remain deferred until all build steps finish. No real email or B2 write is part
of these tests. The parked full visibility-picker browser acceptance remains
for its next frontend owner. Existing step 9 admin placeholders and prototypes
remain outside the setup UI scope. The branch/worktree stay available for
review; no merge or publication is implied by automated checks.

## Product rulings and stated costs

Ruling: Freeze invitation copy and recipient metadata at enqueue; retain the established worker's send-time sender selection. Reason: setup permits invitations before sender configuration, and runMailQueueOnce reads mail.from_address/name at delivery; changing that would extend this slice into mail-delivery semantics. Cost if wrong: changing sender settings also changes the sender of invitations still queued. Task 3 must clarify the design/docs wording and test that a queued invitation can send once mail is configured.

Ruling: A failed actual provider check persists a sanitized last_check_error while preserving the prior verified_at fact; successful checks clear the error and set/clear verified_at, and absent/fake readers do not write provider facts. Reason: the binding notifications contract records the last check error, while the brief's successful-source wording must not erase a real failed attempt. Cost if wrong: a transient check failure remains visible in persisted diagnosis until the next successful check. Provider results must be discarded if the configured sender domain changed during the read.

Ruling: Terminal provider-refusal diagnosis uses the existing 24-hour health horizon; queued retry refusals remain current, worker configuration/render/suppression codes never become provider_rejecting, and unrestricted historical lastError/queue aggregates stay visible. Reason: the actionable diagnosis must distinguish current provider refusal from permanent queue history, including scrubbed codes that cannot be repaired. Cost if wrong: an old terminal row without a precise failed_at timestamp remains historical evidence but does not prove a current refusal. Task 2 documents this in mail and binding notification docs and adds behavioral cases.

Ruling: Add the missing shared InvitationEmailPayload schema/type/barrel exports and meaningful validation tests in Task 3, following the binding notifications payload contract. Reason: the plan assumed this contract already existed, but the shared package lacks it and the compiled template/queue must consume one source of truth. Cost if wrong: the shared package gains a public contract earlier than planned, requiring compatible maintenance. Expanded scope: packages/shared/src/email/\*, relevant shared exports/tests and docs/shared.md.

Ruling: Member suggestions normalize people names with the existing application helper, then use one grouped SQL query to count matched people and cap results at five; update the binding API lookup prose to match. Reason: people has no name_normalized column, and SQLite lowercase would not preserve established Unicode/NFC semantics without a schema change. Cost if wrong: suggestion lookup reads the full small people directory before the capped count query, so its work grows with directory size. Task 3 expands documentation scope to the affected administration API paragraph and tests Unicode whole-word matching.

Ruling: Invitation lapse selects the latest invitation across all history first, then requires that row to be unrevoked, unaccepted and expired; retain the existing max-id query semantics while adding authority cleanup. Reason: the binding API/data-model/job contracts say latest invitation, and filtering to pending rows first could let obsolete history revoke a member despite a newer accepted/revoked invitation. The brief phrasing latest unrevoked/unaccepted is interpreted as conditions on the latest row. Cost if wrong: an older pending row does not trigger lapse when newer nonpending history exists, so an inconsistent invited identity requires explicit lifecycle repair.

Ruling: Preserve Task 5 implementation and honestly report partial pre-implementation RED coverage; require independent review of access/deletion behavior and its tests rather than retroactively claiming registration-removal checks as TDD. Reason: initial create/list tests failed expected 404 and token tests failed missing helper, but access/deletion fixtures failed earlier on duplicate item sequence before implementation. This is a process deviation that cannot be repaired by manufacturing a historical failure. Cost if wrong: access/deletion lack observed pre-implementation behavioral RED, leaving greater reliance on current black-box coverage and independent review. Post-implementation mutation checks are labeled as such.

Ruling: Activity subject IDs admit bounded nonempty setting-key strings for kind setting, retaining UUID validation for every other subject kind; subjectId query filters admit the same setting-key identifiers as well as UUIDs. Reason: setting_changed stores the actual setting key as subject_id, and the binding activity contract uses string IDs; the Task 1 UUID-only schema rejects valid events. Cost if wrong: activity subjectId filters accept more strings, though admin authorization and parameterized exact matching remain unchanged. Task 7 expands shared observation schema/tests and docs/shared.md plus affected binding activity prose. Preserve historical keys without requiring current registry membership.

Ruling: Explicit admin presence lookup for an existing removed identity returns 200 with an empty presence list; only a nonexistent identity returns member_not_found. Reason: binding presence rows exclude removed members, while the 404 definition means no member with that ID at any role. Resolve existence before filtering in the same batched identity read. Cost if wrong: clients requesting a removed identity must handle an empty list rather than a not-found error. Task 7 records a valid RED/GREEN route case and clarifies binding prose.

Ruling: Presence derives calendar boundaries with a dedicated earliest-local-date policy instead of reusing capture-time ambiguity selection, while preserving the capture helper unchanged. Reason: the binding prose specified that helper but the confirmed repeated-midnight case violates its stronger exact-local-day requirement. Cost if wrong: presence owns additional date-boundary logic and conversion work that must be maintained independently of capture-time disambiguation. Update affected binding prose in the fix.

Ruling: Extend Task 7 fix round 1 to represent a local date with disjoint UTC intervals and count distinct local-date labels in the grouped SQL union, rather than assume each date is one contiguous earliest-midnight bucket. Reason: confirmed Goose Bay 2009 rollback briefly enters November 1 then returns to October 31; the stronger exact-local-day contract cannot be met by 91 single boundaries. Cost if wrong: additional bounded timezone-transition/interval logic increases presence complexity and conversion work. Preserve fixed batched reads, no individual mark fetches, capture-time semantics and no extra dependency/table. Add same-day/date-crossing/window-boundary regressions and update binding bucket prose.

Ruling: Resolve Task 7's plan-mandated filename conflict by renaming activityDetailHelpers.ts to getActivityDetailFromEvent.ts and activityKindHelpers.ts to getActivityFamilyFromKind.ts, with their imports/tests updated in the final consolidated fix wave if retained by final triage. Reason: each file has one main runtime export, and the binding module checklist explicitly ignores supporting constants when requiring the filename to match that export. Cost if wrong: small import/test/documentation churn without a behavior change; no collection-file exception is needed.

Ruling: Task 9's navigation module will be named getSetupRedirectFromNavigation.ts (and matching test) rather than the plan's setupNavigation.ts. Reason: the brief specifies exactly one runtime export, getSetupRedirectFromNavigation, and the binding module checklist requires the filename to match it; exported supporting types do not change that rule. Cost if wrong: internal import/test path changes from the approved plan, with no public route or API behavior change.

Ruling: Setup root guards make no HTTP requests during speculative TanStack preloads and provide cached setupMe only; actual navigation still refetches status/progress and runs the shared redirect decision. Reason: the unchanged Item latch contract forbids any preload requests, and the new unconditional root fetch caused its sole full-suite failure; focused new RED also proves actual-navigation freshness after status changes. Cost if wrong: speculative preload context can be stale or absent, but it never renders or authorizes access and real navigation must correct it. Parent checked root/\_app flow and existing/new failing assertions before authorizing this bounded fix.

Ruling: Use an isolated test-owned HTTPS loopback proxy for fresh-catalog browser fixtures, preserving unconditional Secure production cookies and the actual createApp API behind one trusted TLS-termination hop. Reason: installed WebKit discards Secure cookies on both HTTP localhost and 127.0.0.1, so an HTTP-only fixture cannot prove the real authenticated flow; this matches the deployment TLS boundary without weakening cookie security. Cost if wrong: additional test-only certificate/proxy lifecycle complexity and reliance on a production-like forwarded protocol boundary; no system trust store changes, live certificate, new product dependency or fabricated successful API response is allowed.

Ruling: Rename the setup origin module to requireSetupServingOrigin.ts alongside the agreed observation-module renames. Reason: the final review confirms it likewise has one main runtime export, so the binding module checklist overrides the provisional setupOriginHelpers.ts plan filename. Cost if wrong: narrow import/test/documentation path churn without any intended origin-validation change; historical verification commands retain their original paths.

Ruling: Retain the existing large mail-health and setup route suites in this final slice rather than splitting them solely for file length. Reason: final independent review found coherent single-contract coverage with existing separate concurrency/rollback seams and no assertion gap corrected by a mechanical split. Cost if wrong: larger test modules remain harder to navigate and maintain, with a documented size-convention exception pending a meaningful future decomposition.
