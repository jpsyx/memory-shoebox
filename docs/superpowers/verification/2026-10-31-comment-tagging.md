# Comment tagging integrated acceptance

The V1 browser acceptance suite exercises the shipped SPA and Fastify routes
against disposable local catalogs. The starting product HEAD was
`0490090c68341bfeb60b0a215bf63122b58dcddb`. The V1 commit adds the executable
harness, preference-switch focus recovery, and the review corrections below.
The initial acceptance commit was `9df26c924300fda8196127f0187b5071c26e364e`;
its pre-correction captures remain preserved.

## Reproduction and safety

From the implementation worktree:

```sh
pnpm test:e2e:comment-tagging
```

The script builds the application, then runs
`pnpm exec playwright test -c playwright.comment-tagging.config.ts`. The config
has one worker and three explicit projects: Chromium desktop (1440 x 900),
Chromium phone (390 x 844), and WebKit phone (390 x 844). Every case creates a
fresh in-memory migrated catalog, unique real sessions, an OS-assigned loopback
application port, and an independent local fake-S3 port. The ordinary E2E
catalog and ports are never reused. Trace output is isolated by runner PID.

The fixture sets and asserts the API process's `NODE_ENV=development` and
`ENABLE_FAKE_EMAIL=true`, constructs configuration from the explicit sanitized
E2E map, and injects the recording `EmailService`. It asserts that the actual
app uses that recorder and has no mail-domain reader. Credentials for Resend
and Upstash are empty. It never loads ignored environment files, contacts a
mail provider, or adds product endpoints to create sessions or inspect mail.
Storage writes use the real B2 adapter against the loopback S3 stand-in.

The captured-email sign-in case uses an ephemeral local HTTPS reverse proxy.
WebKit rejects the product's unconditional Secure cookie on plain HTTP
loopback. HTTPS preserves that product behavior. The proxy forwards the real
request/response bodies, cookies and redirects, and proxies fake-media reads
through the same HTTPS origin. Upstream origins are checked as loopback and
absolute URL escapes are refused. A one-day self-signed certificate lives in a
new `comment-tagging-tls-*` temporary directory (0700), with its private key 0600. The owned browser context accepts that certificate. No system trust store
or global TLS environment is changed. Successful teardown removes the key and
certificate. `openssl` is required for this test helper.

## Browser coverage

| Area                  | Integrated evidence                                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity              | John collision focuses the name field and preserves the staged photo; John M claims successfully; real route remains on completion after photo failure; retry and skip preserve the precise comment destination.                                                                                                 |
| Avatars               | EXIF-oriented JPEG and 501 x 303 generated PNG use keyboard move, fractional zoom and reset; browser preview pixels are compared with the actual API-saved 256 x 256 WebP with mean absolute channel error below 8; save/cancel focus, confirmed removal, another-window conflict and replacement are exercised. |
| Session retirement    | A real sign-out while an avatar response is held cannot publish its result into the next account. A held comment post through collection departure preserves a newer selected-tag draft.                                                                                                                         |
| Plain versus selected | Typed text stays plain in all engines. Chromium uses the browser clipboard and paste shortcut, restores its previous text, and verifies pasted text stays plain. Explicit picker selection excludes the same-name ad-hoc person and creates persisted identity links.                                            |
| Mail                  | Repeated mentions yield one recorded target message; self-tags yield none; replies and edits notify new recipients only; removing a target suppresses queued delivery; disabling tag mail retains the ordinary upload-comment fallback.                                                                          |
| Corrections           | A selected stale name receives the exact updated-name correction; an ineligible removed target can become plain text without corrupting an existing historical link.                                                                                                                                             |
| Arrival               | The actual recorded email href is followed through real code sign-in and required profile completion; the comment is focused without autoplay or seeking.                                                                                                                                                        |
| Collections           | Main, reply and edit drafts retain selected identity through collection/back; video stays paused; a held next page from Jorge cannot repopulate John's collection after the selection changes.                                                                                                                   |
| Privacy               | Hidden rows and distinctive bare totals (34 and 125) are absent while the collection identity request is pending and after settlement; the hidden item itself returns 404. Access refusal after departure removes sensitive draft and quoted comment content.                                                    |
| New tabs              | Chromium middle-click opens the native anchor in another tab without a return promise. WebKit opens that actual href in a fresh tab and verifies isolation; its physical mobile context-menu gesture is not claimed.                                                                                             |
| Photo people          | Item chips, item options, People directory, active person filter, archive bulk picker and upload picker retain the literal suffix for an 80-character ad-hoc name at narrow widths; same-name member/ad-hoc choices remain separate.                                                                             |
| Preference            | The email settings link focuses the new switch; keyboard activation persists it; a failed save restores the actual value and retains keyboard focus.                                                                                                                                                             |

The first full matrix passed 59 cases and exposed one actual product RED: native
Chromium disabling blurred the focused notification switch during a save. A held
PATCH made the failure deterministic. The owning EmailSheet regression models
that native blur, and separately protects focus deliberately moved elsewhere.
NotifyRow now restores its initiating focus only when saving ends with focus on
the document body. The affected unit tests and all three browser projects pass.

The suite validates the other existing integrated behavior without manufacturing
product RED results. Development failures were in the new harness
or its assumptions, including a copied fake-S3 seed map, canonical timestamp
format in a paging fixture, Secure cookies over HTTP in WebKit, immediate
checkbox state assertions, and WebKit's absent desktop middle-click gesture.
A subsequent WebKit run exposed locator auto-scroll moving an already visible
portal option out of view. The helper asserts focused editor, option viewport
presence and exact center hit-testing, then uses the actual browser pointer at
that visible center on WebKit. No force click or hidden selection is used; API
writes and mail assertions remain unchanged. The helper also waits for exact selected text including its trailing space, a
closed picker, and the native caret at the insertion end before dependent
typing. Focused plain/repeated and reply/edit cases passed.

These harness corrections did not require product changes. The focus correction
above was the only product change in the initial V1 commit. Review round 1
subsequently corrected the approved composer instruction and phone typography.

## Visual inspection

One mechanical Impeccable detector invocation covered the affected Account,
ProfileCompletion, CommentTagInputField, CommentTagText, MemberCollectionHeader,
PeopleField and ItemConversation directories. It reported zero primary findings
and three advisory existing token differences: two 12px radii and one fluid font
endpoint in ItemConversation. These did not establish a requested-scope defect.

One batched capture/inspection and one stable confirmation were performed using
Playwright MCP. The batch includes Day, Porcelain, Slate and Night at 1440,
1024, 390, 320, and short-landscape 844 x 390, with a 4,000-character draft.
All 20 composer measurements had zero horizontal document overflow. The
80-character photo identity wraps and keeps its suffix visible at 320 and 390;
its remove action remains outside the label. The 320px crop dialog occupies the
320 x 844 viewport and its controls remain keyboard reachable. Confirmation
captures include a selected tag, avatar failure initials, empty collection and
request failure. The first full-page crop image included the underlying long
account document; the stable viewport confirmation is the authoritative crop
layout capture. There was no optional redesign or further polishing loop.

Authoritative local evidence:

- `/Users/juanpablosarmiento/src/worktrees/jpsyx/docs/comment-tagging/.playwright-mcp/comment-tagging/visual/`
- `/Users/juanpablosarmiento/src/worktrees/jpsyx/docs/comment-tagging/.playwright-mcp/comment-tagging/impeccable-detect.json`
- `/Users/juanpablosarmiento/src/worktrees/jpsyx/docs/comment-tagging/.playwright-mcp/comment-tagging/final-matrix.log`

The screenshots and machine-readable evidence are also copied to
`~/Downloads/memory-shoebox_comment-tags/comment-tagging/v1-browser/`.
The controller owns the final Markdown/PDF copy of this document.

## Native evidence and limits

| Check                | Observed result                                                                                                                                                                                                                                                                                                                                                                                | Remaining manual check                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium IME         | CDP `Input.imeSetComposition` placed `@Jorge` in the actual engine; Ctrl+Enter during composition did not post or select; `Input.insertText` committed the text.                                                                                                                                                                                                                               | OS IME candidates, physical keyboards and WebKit's native composition. Synthetic DOM events are not presented as this proof.          |
| Fullscreen           | The actual app action set `document.fullscreenElement` and `fullscreenEnabled` to true in headless Chromium. The owned document was exited afterward.                                                                                                                                                                                                                                          | OS/browser-window fullscreen, browser-owned Escape priority, physical Safari fullscreen. This is engine Fullscreen API evidence only. |
| 200% scaling         | CSS `zoom: 2` reflowed the integrated composer with zero horizontal document overflow; original style was restored.                                                                                                                                                                                                                                                                            | Actual browser-chrome 200% zoom. Three Meta-plus shortcuts left viewport 1280 and DPR 1 unchanged; they did not establish zoom.       |
| Screen reader        | VoiceOver was initially absent (`pgrep -x VoiceOver` returned no process). It was launched for an owned local-browser attempt; `get content of last phrase` did not return usable speech. The owned VoiceOver process was terminated and its absence verified. The waiting script ended with `Connection is invalid. (-609)`. Caption settings and trust/permission settings were not changed. | Actual VoiceOver announcements and focus reading. No screen-reader acceptance is claimed. No permission denial was bypassed.          |
| Phone keyboard/touch | Chromium and WebKit phone emulations validate layout, keyboard events and route interactions.                                                                                                                                                                                                                                                                                                  | Physical-device keyboard-open visual viewport, touch scrolling, OS keyboard and Safari long-press/new-tab behavior.                   |
| Clipboard            | Actual browser paste was exercised in Chromium with the prior clipboard restored without logging it.                                                                                                                                                                                                                                                                                           | WebKit physical paste gesture. WebKit's ordinary inserted text and selected-reference behavior are covered separately.                |

These limits remain explicit acceptance work. Unit tests, headless engine APIs,
CSS scale and phone emulation do not substitute for them. V2 owns the broad
`pnpm check`, resource envelope and migration rehearsal.

## Executed validation

All commands ran in `/Users/juanpablosarmiento/src/worktrees/jpsyx/docs/comment-tagging`
on 2026-10-31, from starting HEAD `0490090c68341bfeb60b0a215bf63122b58dcddb`
plus this V1 diff. The final source revision is the commit that introduces this
record; its exact hash is recorded in the worker report after committing.

| Command                                                                                                                                                                  | Result                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm exec playwright test -c playwright.comment-tagging.config.ts`                                                                                                      | PASS, 60 cases in 1.4 minutes, exit 0, final source and test revision.                                          |
| `pnpm build`                                                                                                                                                             | PASS, rebuilt after the focus correction.                                                                       |
| `pnpm --filter @memory-shoebox/web test src/surfaces/Account/EmailSheet/EmailSheet.test.tsx src/surfaces/Account/AccountSurface/__tests__/AccountSurface.email.test.tsx` | PASS, 16 tests.                                                                                                 |
| `pnpm exec playwright test -c playwright.comment-tagging.config.ts -g 'account notification switch'`                                                                     | PASS, all three projects.                                                                                       |
| `pnpm exec playwright test -c playwright.comment-tagging.config.ts --project=webkit-phone -g 'reply and edit tags' --repeat-each=3`                                      | PASS, three focused pointer confirmations. Earlier scroll-based diagnostics failed and are retained separately. |
| `pnpm exec playwright test -c playwright.comment-tagging.config.ts -g 'EXIF photo keyboard crop'`                                                                        | PASS, all three projects, including both zoom buttons and all four movement controls by keyboard.               |
| `pnpm exec tsc --noEmit`                                                                                                                                                 | PASS, root harness types. The build also checks web types.                                                      |
| Focused `pnpm exec oxlint` / `pnpm exec oxfmt --check` on all added/changed source and docs                                                                              | PASS.                                                                                                           |
| `git diff --check` and staged diff inspection                                                                                                                            | PASS.                                                                                                           |

## Review round 1: composer instruction, typography and identity proof

R1 corrected the missing approved **Type @ to tag a member.** instruction in
the shared writing/reply/edit field. It occupies a separate line and stays at
least 15px. Phone-width and coarse-pointer layouts use at least 16px native
input and mirror text; desktop remains 15px. Native and mirror font size and
line height now use declarative CSS. The mirror retains its existing computed
padding, whitespace and scroll synchronization, but no longer caches stale
inline font-size/line-height after viewport changes.

Before correction, the shared unit test failed on the missing instruction and
the real Chromium phone case measured 15px input with no hint. The first
bounded capture also exposed a stale 15px mirror beside 16px native text after
coarse-pointer landscape/rendition changes. An initial-state browser regression
confirmed the mirror mismatch before the declarative correction. These REDs are
retained in `r1-unit-red.log`, `r1-browser-red.log`, `r1-mirror-red.log` and
`visual-r1-before-mirror/capture-evidence-before-mirror.json`.

R2 strengthens all main/reply/edit collection-return submissions and the newer
pending-departure draft: each must send the expected body and exact member ID
with offsets, then expose that member link and href in the article identified
by that response's comment ID. Preexisting Jorge links cannot satisfy these
assertions. They passed without a product-reference correction.

The final revision passed 60/60 browser cases (1.4 minutes, exit 0), including
the strengthened identity and font/line-height assertions. The focused twelve
return/pending cases, ten shared-input unit tests, build, root harness types,
focused lint and formatting also passed. An earlier matrix was intentionally
interrupted after the mirror finding and is retained as
`r1-interrupted-matrix.log`; it is not a successful result. The final browser
command used `env -u NO_COLOR pnpm exec playwright test -c playwright.comment-tagging.config.ts`
to remove inherited color-configuration noise. The build's existing dependency
module-directive warning remains tooling noise, not a pristine-output claim.

One affected capture batch and its necessary confirmation are preserved. Final
`visual-r1/` contains 16 composer captures and four contact sheets: all four
renditions at 1440 desktop, 390 and 320 phone, and 844 x 390 coarse-pointer
landscape. Every capture contains 4,000 characters and a selected identity.
Final recorded native/mirror sizes are 15px/15px with 23.25px line height on
desktop, and 16px/16px with 24.8px line height on the three phone layouts. Help
is 15px, below the field; horizontal document overflow is zero in all 16.
The contact sheets and representative full images were inspected. The hint is
visible and separate from the counter/send controls. No extra detector sweep
or native probe was performed. These measurements do not establish physical
iOS autozoom behavior, and the earlier native limits remain unchanged.

The authoritative new evidence directories are
`/Users/juanpablosarmiento/src/worktrees/jpsyx/docs/comment-tagging/.playwright-mcp/comment-tagging/visual-r1/`
and its sibling `visual-r1-before-mirror/`. Both are copied, with SHA-256
manifests, under
`~/Downloads/memory-shoebox_comment-tags/comment-tagging/v1-browser/`.
The original `visual/` directory remains explicitly pre-R1 evidence.
