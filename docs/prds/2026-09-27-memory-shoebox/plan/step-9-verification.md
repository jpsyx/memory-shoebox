# Step 9 verification

Status: implemented and reference package retired; automated checks passed
with the targeted harness correction recorded below. Acceptance remains qualified by the explicit limits
in this record. No server files were changed, no mail was sent, and no deployment,
push, merge or pull request was made.

## What changed

Members preserve successful invitation identity, role and queued-mail status in
the disabled form. A committed mutation and a failed account refresh are separate
states: persistent recovery gates further writes and retries reads only, even
after leaving the route and ordinary query-cache expiry. Own-device revocation
and self-removal still clear the session and go straight to sign-in without
another account refresh. Directory read refusal no longer reverses that expected
session loss. Role explanations, invitation safety copy and plus affordances
match the drawn intent. Groups include the name hint and singular counts.

Each timeline day contains its sticky summary before the archive footer. Account
device facts and actions reflow as labeled rows at narrow widths. Email paragraphs
explicitly use 16px/24px; bordered dark actions use white bold text and 12px/20px
padding; footer links are underlined. The removal-request form restores the drawn
normalization sentence and Flag icon without changing request behavior.

The retired reference workspace, its dedicated documentation, dev command,
Docker manifest copy and lockfile importer are removed. All 118 generated media
files were compared byte-for-byte and preserved, with the generator and its tests,
in `e2e/fixtures/cartoon-media/`. Occasion visual tests now serve those bytes and
assert production layout without a second dev server. Production tokens/theme
and durable product decisions remain owned by the app and design record.

## Automated evidence

The reproducible admin command is `pnpm test:e2e:admin`. Each case owns a fresh
migrated SQLite catalog and Fastify origin serving the built SPA, with fake B2
and actual generated media bytes. It does not mutate another case's session or
the controller's manual catalog. The test-only session-entry route is harness
code, never a production route. Failure injection intercepts specific reads;
committed writes and subsequent catalog assertions use the real API/database.

RED was observed before behavior changes:

| Regression                               | Expected failure before fix                                          | First GREEN                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Invitation success retains fields        | Filled email input disappeared after saved invitation                | Four-case acceptance suite passed                                           |
| Saved invitation/account refresh failure | No truthful queued state after a persisted invitation and `/me` 503  | Same four-case suite passed; route/cache-expiry unit regression also passed |
| Account device action at 400px           | Sign out here right edge 539.34375, expected at most 400             | Same four-case suite passed; native actual right edge 188.719               |
| Timeline archive end at 864x470          | Milestone bottom 335.109375 exceeded footer top 258.578125           | Same four-case suite passed; separate actual native 200% check              |
| Rendered email action                    | Default blue `#067df7`, measured 3.974:1, lacked drawn action styles | 53 email tests in 10 files passed                                           |
| Current-device/self-removal preservation | Both cases emitted an unwanted account GET after session loss        | Both passed after cached-null authority guard                               |

Commands and logs are retained under ignored `.playwright-mcp/step9-acceptance/`.
The initial timeline attempt failed because fixture media URLs were invalid and a
locator was wrong; only `task5-timeline-red-final.log` is valid layout RED evidence.
Final commands and results:

| Command                                                                                                                                        | Result                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --lockfile-only --ignore-scripts`                                                                                                | Exit 0; removed obsolete workspace importer without dependency snapshot hand edits                                                                   |
| `pnpm check` after deletion                                                                                                                    | Exit 0: 3,602 tests, 570 files (root 151/23, shared 284/21, email 53/10, web 1,425/234, server 1,689/282), format/lint/types/build passed            |
| `pnpm exec playwright test e2e/empty.spec.ts e2e/occasions-and-removals e2e/admin --project=chromium`                                          | 73 passed, 2 failed; all admin cases and 19 production visual states passed, two obsolete failure-injection URL patterns missed relocated thumbnails |
| `pnpm exec playwright test e2e/empty.spec.ts e2e/occasions-and-removals/responsive.spec.ts --project=chromium` after correcting those two URLs | 11 passed in 17.1s, including both previously failing unavailable-image/focus cases; assertions preserved, no skips                                  |

After self-review, the invitation fixture uses clock-relative expiry/cooldown
instead of aging fixed dates. Its live/acceptance rerun passed 13 cases in 7.3s.
The ordinary config explicitly selects `dist-e2e` for isolated admin catalogs;
the dedicated command and native runner use `dist`. This avoids an accidental
dependency on an old production build when running the ordinary suite on a fresh
clone. The ordinary admin+empty build-selection run passed 16 cases and exposed
one ambiguous status locator during the valid transient reconciliation status.
Scoping that assertion to the queued-invitation status preserved its meaning;
`pnpm exec playwright test e2e/admin/acceptance.spec.ts --project=chromium --grep
'a committed invitation retains'` then passed 1 case in 5.8s. Final
`pnpm format:check`, `pnpm lint` and `pnpm type-check` passed after those narrow
harness corrections. No production behavior was changed by these harness fixes.

The full browser selection contains 75 required cases. Every case passed either
in the 73-case successful portion or in the targeted corrected run. No required
case was skipped, removed or weakened. The ordinary empty archive ran before any
shared archive seed; isolated admin cases do not modify that catalog. Normal tools emitted existing build chunk-size warnings,
react-email deprecations, Playwright color-environment warnings and jsdom scrollTo
noise from existing tests; these are not application console acceptance failures.

Live browser coverage includes Running the Shoebox navigation, last-active-admin
UI/API guards, real invitation suggestions/resend cooldown/revocation, devices,
self-removal, group Only/Except consequences and changed consent, settings local
preview/save/reload, presence and combined activity URL filters. A passive report
regression attaches an item and sibling to a burst and asserts identical complete
`item_views` rows through entry, reload, viewer-read failure and Retry, and zero
normal item GETs. This protects seen/open counts rather than merely spying on
mocked UI calls. Unit coverage retains recovery through route changes/cache expiry.

## Comparison inventory and differences

Every configuration below means 400, 768 and 1280 CSS pixels, each in actual
emulated OS light and dark preferences. App captures assert the actual body colors
`rgb(201, 214, 237)` and `rgb(13, 24, 54)` where applicable. Merely setting the
Mantine attribute was rejected as proof; early mislabeled captures were replaced.
Screenshots were visually inspected as paired montages, not counted as proof.

| Surface          | States inspected                                                                                        | Correspondence and justified differences                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in          | email, six configurations                                                                               | Configured instance name replaces the drawn placeholder; same field/action and invitation-only explanation                                                                                                                                                                                                        |
| Empty archive    | new/admin and restricted/viewer, twelve configurations                                                  | Genuine no-items/no-milestones catalog; viewer privacy explanation matches restricted reference, admin invitation/upload doors match new reference. Production global navigation remains available                                                                                                                |
| Timeline         | pile, six configurations; archive-end fix                                                               | Real four-item catalog, dates and milestone differ; retained layout/flow, actual media decode, bounded day summary                                                                                                                                                                                                |
| Find             | open filter, six configurations                                                                         | Live filter/navigation contract and actual catalog counts; global navigation retained                                                                                                                                                                                                                             |
| People           | list, six configurations                                                                                | Real member/person identities and counts, production navigation                                                                                                                                                                                                                                                   |
| Photo            | default, six configurations; native tagged viewer                                                       | Real photo; admin editing controls follow actual authority. Tagged viewer's own open request prevents duplicate Ask                                                                                                                                                                                               |
| Video            | paused, six configurations; native tagged viewer                                                        | Real playable media/poster; tagged viewer with no request exposes actual Ask flow                                                                                                                                                                                                                                 |
| Upload           | selection, six configurations                                                                           | Existing controlled upload harness; no real external upload claimed; disabled controls exempt from contrast threshold                                                                                                                                                                                             |
| Account          | default, six configurations; device row correction                                                      | Actual sessions/addresses. Reflow corrects a drawn narrow table overflow rather than copying it                                                                                                                                                                                                                   |
| Members          | list, invite, pending, change-role, last-admin, remove, devices; six each plus six device-section pairs | Controller inspected 42 core configurations and six device-section pairs. New pending six-config confirmation retains real identity/role and forwarding explanation; truthful queued status instead of claiming delivery. Real session list adds actual device facts                                              |
| Groups           | list, create, edit, delete, delete-used; six each                                                       | Controller inspected all 30 configurations. Bounded create confirmation includes plus, drawn name hint and singular count; Only/Except summaries intentionally expose distinct actual directions                                                                                                                  |
| Settings         | default, renaming, tidy, timezone, mail-failing; six each                                               | Real four-photo preview, configured name/timezone and truthful storage facts. Health-only mail recheck replaces nonexistent test-send contract; actual environment warning remains visible                                                                                                                        |
| Presence         | default, never-arrived, one-item; six each                                                              | Real full directory includes never-signed-in invited member, rather than a fabricated filtered subset. Labeled mobile facts replace overflowing reference table. Direct passive report intentionally has no invented preview/date, only explicit item link and viewer facts                                       |
| Changes          | default, authority, person, gone, empty; six each                                                       | Actual event history and combined filters; readable kind/settings labels, accurate archived subject text without broken link. Empty history does not claim no members/groups exist                                                                                                                                |
| Milestones       | default, six configurations                                                                             | Actual occasion/counts; existing controlled 19-state occasion/removal matrix remains reproducible without reference server                                                                                                                                                                                        |
| Ask removal      | ask, six configurations                                                                                 | Tagged video's real metadata stays above form; optional private reason remains blank. Normalization sentence and Flag restored in bounded confirmation                                                                                                                                                            |
| Removal requests | proper open list, six configurations                                                                    | Actual one open request/current identity versus drawn two; generic truthful heading and full Keep/Delete controls. Earlier empty list was not counted as corresponding open evidence                                                                                                                              |
| Emails           | all twelve variants, six each                                                                           | Actual compiled HTML and plain text: code, invitation, upload, narrowed upload, multi-day upload, comment, reply, request, reminder, gone, declined, withdrawn. Literal white paper/system fonts, truthful counts/dates and unsuppressible footer. Drawn envelope/demo plaintext wrapper is not part of sent HTML |

Evidence folders: `reference/` (150 original admin captures),
`all-surfaces-reference/` (108 original surface captures plus restricted-empty),
`live/all-surfaces-current/` (54 controller captures), `live/final-admin/`,
`live/final-remaining/`, `comparisons/final-admin/`, `comparisons/final-*.jpg`,
`emails/final-comparison-*.jpg`. All are relative to the ignored acceptance root.
The controller reviewed saved comparison evidence before acknowledging deletion.
No reference screenshot was deleted with the package. Some full-page sticky-bar
captures initially retained a scrolled paint position; the capture helper now
scrolls to zero and waits for paint before saving.

## Keyboard, contrast and actual native zoom

Real browser focus coverage exercises role/removal/device dialogs, Escape return,
invitation fields and errors; existing occasion tests exercise Tab/Shift+Tab/Enter,
trapping and restoration. The controller's contrast sweep found no enabled-text
failures across twelve actual routes in both schemes. Admin default Presence and
Changes at 400px also pass the automated text-contrast sweep. Email blue-action
failure was fixed with the drawn high-contrast action. The one final design
detector pass scanned 26 changed markup owners, exited zero with eight advisory-only
email literal-font findings. Those are intentional email-specific typography,
not application type tokens; no detector suppression was introduced.

The controller verified actual Chrome Zoom 200% in the native accessibility UI,
not through viewport emulation. Inspected Settings top/name, arrangement, timezone,
mail and storage; Presence directory/end and passive item report; Changes filters
and history; Members/Groups lower sections; genuine empty viewer and visible Find
focus; real tagged photo/video; proper open-removal list and request form. The Keep
dialog autofocuses the reason, Tab scrolls lower Send/Cancel/visibility controls
fully into view with visible outline, and Escape restores Keep. No request or
revocation was submitted in native checks.

Bounded native fixes: `native-zoom/fixed-timeline-bottom-200.review.jpg` shows the
milestone above the archive footer; `fixed-account-device-action-200.review.jpg`
shows the full current-device row and confirmation/Escape restoration;
`owned-open-removal-dialog-controls-200.review.jpg` shows lower dialog controls.
At ordinary 400px, separate Account Day/Night captures measure Sign out here at
x58, width130.719, right188.719 with no document overflow. Earlier captures named
only devices show adjacent/footer regions and are not row evidence.

Updated actual code/invitation HTML was inspected at native 200%, including whole
body/footer, dark action, larger paragraphs, Tab outlines and underlined source
link with automatic scrolling. Five `native-zoom/fixed-email-*` PNG/review images
record this. No link was activated or message sent. Browser preferences and native
Chrome do not prove real email-client dark transforms.

A full keyboard/native zoom traversal of every state and control across all
eighteen surfaces remains outstanding. The actual region checks and isolated
browser tests above do not certify that complete traversal.

VoiceOver traversal remains unverified: shortcut, Settings toggle and explicit
bundle launch did not produce a running process/caption/cursor; launch timed out.
The controller restored the original toggle, closed its utility and confirmed both
VoiceOver apps stopped. Accessibility trees are not screen-reader acceptance.
After native checks, both localhost and 127.0.0.1 task origins were restored to
actual Chrome 100%; the original user tab was untouched.

## Remaining limits and retirement exception

The no-retired-package-reference search does **not** pass. It reports exactly two
lines in unchanged `apps/server/scripts/seedArchive.ts`: line 25's default media
path and line 50's explanatory comment. Server scope approval remains unanswered.
Object seeding must explicitly use the new directory, as documented in
`docs/media.md`: `pnpm seed:archive --as admin@example.com --media-dir "$PWD/e2e/fixtures/cartoon-media/web"`.
The default command remains broken for object reads until that server-owned path
is corrected. Catalog-only `--no-objects` and browser fixtures are independent.

Mail health can be rechecked, but there is no test-message API and no delivery
claim. Access logs remain deployment-managed operational records: sign-in addresses
in URLs can outlive the product presence/activity retention, and owners must manage
that separate copy. Real Backblaze delivery, real email delivery, VoiceOver and
actual email-client transformations are not established by this fixture suite.

Historical plans/snippets use explicitly defined archival `reference/` shorthand,
recoverable from commit `3e09157b`. It is not a current directory or runnable
command, and old reference links are no longer clickable nonexistent paths.
Substantive product decisions were preserved. Exact source spelling is recovered
from that commit rather than from rewritten current documentation.

## Decisions and costs

Ruling: execute the full cycle without repetitive artifact approval requests because the user's step explicitly says to ask only facts the existing documents do not settle, and the current request authorizes execution. Cost if wrong: design changes can be reviewed and undone in the isolated branch.

Ruling: mail test has no delivered API endpoint. Do not invent a server change, inert success or email delivery; record the gap and use existing health read for recheck. Cost if wrong: specified test-email action remains unavailable.

Ruling: retirement updates historical path/reference wording in product documents despite the earlier read-only instruction; step 9 explicitly requires no retired-package references in docs. Preserve all substantive product decisions. Cost if wrong: historical source paths are replaced by durable production paths.

Ruling: use pnpm --filter @memory-shoebox/web exec vitest run <paths> for focused tests. The package test script plus an extra -- ran the whole suite instead of filtering. Cost if wrong: command-only correction, full workspace checks remain required. Task 1 full RED was 14 failed plus absent helper suite; 1,291 baseline tests stayed green.

Ruling: each surface task may update its own existing routes/rendering.test.tsx placeholder smoke assertion and the real response fixture it now consumes. Task 1 first implementation run passed its 22 new tests and exposed the old /members heading expectation. Cost if wrong: narrow integration-test expectation change; unrelated cases stay intact.

Ruling: keep existing access logs as a separate deployment-managed operational record and document that sign-in addresses there are outside product presence/activity retention. Step9 forbids server changes and the URL design deliberately carries addresses. Cost if wrong: owners must change operational logging or retention separately; the product does not automatically purge that copy.

Ruling: show human-readable activity kinds and setting names in Changes while preserving every kind distinction and exact filter values. The reference drew raw enum captions, but product copy should explain the event in familiar language. Cost if wrong: these captions differ cosmetically from the reference; row structure and historical facts remain intact.

Ruling: item viewer reports must be passive. Use already cached real item context without triggering the counting item GET; when absent, render a truthful item-identifying link and the real viewer response without a fabricated thumbnail or date. This overrides the plan's requirement to fetch the normal item query because that query changes opening and burst-seen observations. Cost if wrong: direct report links without cached context omit the preview until the item is explicitly opened; a passive metadata endpoint remains a separate server task.

Ruling: historical plans and snippets may use explicitly defined archival reference/ shorthand for retired source recoverable from base commit 3e09157b, never a clickable nonexistent current path. Current operational docs must use real production paths, and all substantive historical decisions remain. This resolves the large archival-reference cleanup without pretending old snippets are runnable instructions. Cost if wrong: exact old path spelling is rewritten; reproducing historical source requires reading the base commit.

## Task 5 review correction, round 1

Review finding 2 is covered by five new isolated real-browser keyboard cases in
`e2e/admin/keyboard.spec.ts`. Tab/Enter opens account administration and invitation;
invalid email feedback is associated with the input, and a real duplicate-address
API refusal is an alert retaining the typed address with no new invitation row.
Role, removal and device confirmations wrap focus in both directions and restore
the initiating button on Escape. A real role write followed by an intercepted
account-read failure disables the original trigger and restores focus to the
Member administration region; the recovery button remains keyboard reachable.
No product focus implementation changed in this round.

The video investigation measured readiness, real duration, seekable ranges,
`currentTime`, and slider `aria-valuenow`/`aria-valuetext` together. Before repair,
readyState was 4 but the ten-second file had seekable `[0, 0]`; the fixture catalog
claimed four seconds. Twenty-one Right keys moved the slider to four while the
actual playback time stayed zero. The regression failed with seekable end 0
(expected greater than 1). The fixture now serves byte ranges and the actual
10,000ms duration. The same diagnostic measured seekable `[0, 10]`, slider/time 10
after twenty-one Right keys, and both zero after Home. No VideoFrame product
change or new product scope was necessary.

`pnpm exec playwright test -c playwright.admin.config.ts keyboard.spec.ts video-keyboard.spec.ts`
passed all six cases in 3.5s, with no skips. The new video case independently
checks decoded media readiness, seekability, ArrowRight to one and two seconds,
End to ten and Home to zero, actual playback position and accessible clock.
Logs: `task5-keyboard-video-red.log` and `task5-keyboard-video-pass.log` in the
ignored acceptance directory. Earlier draft test failures were incorrect harness
assumptions: a general duplicate-address alert is not a field-specific server
error; this Chromium/macOS native select uses typeahead rather than Home/ArrowUp;
and a Groups link precedes the recovery button in Tab order. Assertions now follow
the actual contract and keyboard path without replacing input with scripted focus
or value assignment. Root TypeScript checking (`pnpm exec tsc --noEmit`) passed.
The existing FORCE_COLOR/NO_COLOR warning remains disclosed. No broad suites were
repeated for this test-harness-only round.

Controller continuation at actual native Chrome 200% inspected twenty additional
app captures in five `continuation-review*.jpg` montages plus
`continuation-actual-ends-review.jpg`: Find words/date/end, People link/privacy end,
photo React keyboard open/Escape, Comment/description focus and full actions end;
video Play/slider/end (seek recheck recorded separately); upload chooser, Only via
Right, picker and disabled end actions; Milestones New/autofocus, five Tabs to
Cancel and return, plus full row end. No saves, deletes or uploads were submitted.
Thirty further native email captures, inspected in eight
`continuation-email-review*.jpg` montages, cover the remaining ten actual compiled
variants: body/action/footer at 200% and visible Tab outlines. Gone has only its
source link and Declined two links, consistent with unsuppressible-message copy;
corrected Tab counts reached those footers without activating links. Together
with the earlier code/invitation checks, all twelve compiled email variants have
bounded native 200% reading/focus evidence. Baseline regions across all eighteen
surfaces now have broader inspection than top-only captures; exhaustive every-state,
every-control keyboard/native traversal and VoiceOver remain unverified.

Ruling: preserve the explicit step9 prohibition on apps/server edits while its requested zero-reference retirement gate conflicts with the unchanged seed default. Continue all authorized fixes and review, retain the exact media-dir workaround and report retirement as qualified until Juan Pablo authorizes the narrow path/comment correction. Cost if wrong: default object seeding remains broken and the original no-reference gate remains incomplete.

The controller then verified the repaired video fixture at actual native Chrome
200%: focused slider starts at 0/10, consecutive Right keys show 0:01 and 0:02,
Home returns 0:00 and End reaches 0:10, with frame progress, visible focus outline
and all controls fitting. Both saved images were visually inspected:
`continuation-video-seek-confirmed-200.review.jpg` and
`continuation-video-end-key-confirmed-200.review.jpg`. This confirms the fixture
diagnosis without a player source fix. The 127.0.0.1 task origin was restored to
100% (native AX verified), and localhost remains at 100%.

Final scoped verification after the harness correction: the six browser cases
passed again in 3.5s (`task5-fix1-browser-final.log`); root TypeScript, oxlint on the
four changed test/harness owners, oxfmt on all six changed files, and
`git diff --check` exited zero. Initial static findings (a test-only Fastify type
import, required block-body arrows and a shadowed variable) were corrected within
the harness before those passes. The final lint/type outputs are empty and format
reports all matched files correct. Browser color-environment warning is unchanged.
