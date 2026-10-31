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

## V2 catalog recovery rehearsal

All data was generated locally. The rehearsal source, command transcripts, fixtures,
container metadata and assertions are retained in the execution evidence archive
under `v2-evidence/`. No production catalog, provider, mail recipient or deployment
was accessed. `migration.mjs` and `migration2.log` record the successful sequence;
the initial harness typo (`parent_id` instead of `parent_comment_id`) is retained
in `migration.log` and is not a product failure or TDD red result.

Eight pre-0019 identities covered normalized duplicate names, an email-local
fallback collision, an invalid name, a removed account, an unjoined invitation,
a valid unique name and a unique fallback. The fixture included linked and ad-hoc
people, photo associations, a comment and reply, and a queued mail row. Assertions
verified:

- Audit left both catalog bytes and every schema/data snapshot unchanged.
- Unresolved/stale stage inputs, unstaged collisions and a subsequently stale
  staged fingerprint failed without changing identities, people, comments, mail
  or migration history.
- A deliberate exception **after real 0021 finished** rolled all three pending
  migrations, staging consumption, data changes and history back together.
- Explicit choices preserved member/person/comment/reply/item/outbox IDs and
  references through 0019-0021. Eight claims and one existing mail row remained
  stable through repeated migration and two real application startups.
- The real startup/sweep/drain lifecycle retired a deliberately abandoned avatar
  reservation and deleted its fake stored object. No mail service was installed.
- Both the manual backup and stage's independent **pre-stage** backup passed
  `integrity_check`, `foreign_key_check` and standalone DELETE-journal checks.
  The CLI refused an existing backup destination.

`restore-sidecars.mjs` additionally killed a disposable SQLite writer after a
committed WAL write, stopped every owner, retained the actual main/WAL/SHM files
in one diagnosis directory, and restored the verified pre-stage snapshot. Numeric
owner/group 501/20 and mode 0640 were restored and checked on this Mac. The actual
archived release `187e8baf95836195e1b07b14041ce65abedde010` then reported no pending
migrations through 0018 and served HTTP health 200 with owned jobs started and
fake B2/no mail. `old-release-provenance.json` records the resolved archived shared
source and archived compiled email entry point; identical-lock third-party
modules were reused. This was a source archive, not another worktree. The
[rollout guide](../../comment-tagging-rollout.md) gives operator commands and the
matching-release restore order.

## V2 avatar resource boundary

The measured environment was a disposable Linux ARM64 Docker container, Node
22.23.3, Sharp 0.35.5, libvips 8.18.7 and libwebp 1.6.0. The actual cgroup values
were `memory.max=536870912`, `memory.swap.max=0`, and `cpu.max=100000 100000`.
No swap or unbounded CPU could hide an overrun. This is an explicitly chosen
512 MiB equivalent bound: no tracked `fly.toml` establishes deployed settings and
none were inspected. Docker image IDs and full codec versions are in the archive.

Pre-generated procedural images contained varying RGB and alpha values, including
many distinct noisy tiles. Generation ran outside the measured API/container.
The input manifest includes dimensions, encoded sizes and SHA-256 hashes. Natural
encoded sizes ranged from 642,263 to 7,575,149 bytes; separate exact-10-MiB variants
padded those same nontrivial images. Padding alone was not the codec memory proof.
The alpha PNG depth was inspected as 16 bits per sample. Actual HTTP reservation
and binary upload routes, real sessions, fake B2 and no-mail services were used.

The original implementation was unsafe: valid 50 MP alpha WebP killed the API
with Docker `OOMKilled=true`, exit 137. Pre-resize extraction disabled WebP
shrink-on-load. A second measured failure exposed full reduced-frame rotation;
a third exposed the no-shrink corner at a 256-pixel selected crop. The final
implementation keeps the shared full-resolution integer square authoritative,
inverse-maps it into the encoded orientation, limits the reduced WebP raster to
12 MP, reads a small enclosing ROI, and maps fractional crop edges to the 256
output using affine sampling. It rotates only the final square. The ROI is at
most 261 pixels per side. All eight EXIF transforms, including mirrored 5 and 7,
were compared with literal original crop rectangles. Eight full-size extreme
comparisons had mean absolute channel error 3.65-7.75 out of 255. This proves
framing and measured visual parity, **not pixel identity**: extreme zoom can
sample an intermediate crop smaller than 256 pixels and reconstruct the output.
No original size, byte limit, zoom range or shared geometry contract was reduced.

Sharp uses one processing thread and no retained image cache, matching the
existing media recipe settings. The existing shared decode coordinator now offers
immediate admission: avatars reject before buffering when background work owns
or waits for the lane; background work waits until the admitted avatar actually
settles. Aborts do not release started work prematurely. No Promise timeout is
claimed to cancel native work. A translucent-color regression caught and fixed
incorrect reuse of `OutputInfo.premultiplied` as raw-input metadata.

The complete 16 MP intermediate matrix (`resource4.log`, `resource-results4.json`) completed
34 cases: 32 valid uploads returned 200, corrupt and animated inputs returned 400.
Every image had centered, off-center fractional zoom, zoom 8 and exact-10-MiB
cases. Concurrency used natural-size fixtures (642,263-7,575,149 bytes), whose
competitors returned 503 `avatar_busy`; the exact-10-MiB cases were serial. Sampled
native work never exceeded one active decoder. The separate maximum-body probe
below closes the concurrency gap identified in review.

| Input                        | Dimensions   | Maximum request ms | Sampled container MiB | Sampled API RSS MiB |
| ---------------------------- | ------------ | -----------------: | --------------------: | ------------------: |
| EXIF JPEG                    | 10000 x 5000 |              399.7 |                 310.4 |               362.5 |
| Alpha PNG, 8-bit             | 7071 x 7071  |              166.8 |                 235.8 |               287.5 |
| Alpha WebP                   | 10000 x 5000 |              568.6 |                 312.4 |               364.7 |
| Wide alpha WebP              | 16383 x 3051 |              394.3 |                 370.0 |               422.1 |
| Wide oriented alpha WebP     | 16383 x 3051 |              419.3 |                 382.2 |               434.2 |
| Alpha PNG, 16-bit            | 7071 x 7071  |              345.3 |                 373.1 |               424.7 |
| 256px maximum-zoom crop WebP | 16383 x 2055 |              390.9 |                 463.3 |               515.2 |
| Oriented 256px crop WebP     | 16383 x 2055 |              444.5 |                 476.7 |               528.8 |

The kernel's cumulative `memory.peak` was **499,859,456 bytes (476.7 MiB)**;
`memory.events` reported no OOM/kill, and the app shut down normally. Sampled
process RSS reached **528.8 MiB**, which includes mapped/shared pages accounted
for differently by the cgroup. These are separate measurements. That limited headroom prompted one bounded
comparison at 12 MP, which is the selected final intermediate cap below. Neither
measurement establishes a universal ceiling for all codec content or inspects
the actual deployed target. Maximum concurrent health
latency was 59.5 ms; every health response was 200.

Real sweep, deletion, mail, media-processing and fingerprint job-runner calls
settled while avatars ran; the two decoder jobs waited for the shared lane.
Automatic media codecs were disabled in this fixture because no delegated worker
cgroup was configured. A separate controlled probe ran the actual native photo
fingerprint helper through that same coordinator: an avatar was refused with 503
in 10.1 ms, then succeeded after decoding finished, with one active decoder and
202.6 MiB cgroup peak. This proves lane interaction, not production worker-cgroup
provisioning. The existing isolated media runtime still fails closed when its
own prerequisites are unavailable.

### Selected 12 MP cap

One final bounded comparison lowered only the **intermediate** WebP raster cap
to 12 MP. The same eight full-size reference comparisons passed at 3.65-7.75 mean
absolute channel error. The four widest/small-crop inputs, orientations 1 and 6,
ran through the actual route at maximum zoom twice each: eight successes, no
OOM, maximum 429.4 ms. Kernel peak was **324,067,328 bytes (309.1 MiB)**;
sampled API RSS was **378,138,624 bytes (360.6 MiB)**. Linux `smaps_rollup`
maxima were RSS 369,792 KiB, PSS 369,788 KiB, private clean 64,028 KiB,
private dirty 305,760 KiB and shared clean 4 KiB. File-backed page accounting
explains why process residency and cgroup charges are not interchangeable.
The final cap leaves measured resident headroom as well as cgroup headroom.
`full-parity-12mp.log`, `resource-12mp.log` and `resource-results-12mp.json`
retain this comparison. The final selected implementation then repeated the **complete 34-case matrix**
(`resource-final.log`, `resource-results-final.json`) and the shared native-lane
probe. All 32 valid requests returned 200; corruption/animation returned 400;
natural-size concurrent requests returned 503; exact-10-MiB cases were serial.
Kernel peak was **428,945,408 bytes (409.1 MiB)**,
sampled API RSS **486,043,648 bytes (463.5 MiB)**. Sampled rollup maxima were RSS
473,336 KiB, PSS 473,332 KiB, private clean 64,556 KiB, private dirty 409,032 KiB
and shared clean 4 KiB. OOM/kill counters remained zero and shutdown exited 0.
Every health request returned 200, maximum 71.6 ms. Maximum upload time was
1,499.5 ms while workspace/browser verification also used the host; these are
observations under the recorded CPU quota, not latency guarantees. The native
background probe returned 503 in 7.1 ms and then 200 after work settled; active
decoders never exceeded one. JPEG/PNG behavior and source limits are unchanged.
Actual target configuration remains a deployment gate.

### Review follow-up: exact-10-MiB concurrency

Review found that the historical full matrices did not combine exact maximum
body size with concurrency. One focused pair closed that gap, using the same
selected 12 MP image (`sha256:2345d281f2abec057c0b122f9ac8534cf283ff0c00f1ca36873e49ded62e45b5`),
512 MiB memory/memory-plus-swap, zero cgroup swap, and one CPU. No product code,
full matrix, unit suite or browser suite changed or reran.

Both uploads used the pre-generated nontrivial 16383 x 2055 alpha WebP with EXIF
6, off-center zoom 8, padded from 2,076,766 to exactly **10,485,760 bytes** before
the measurement. Raw HTTP instrumentation observed `Content-Length: 10485760`
for both requests. The second started 61.2 ms after the first and arrived with
one native decoder active. It returned **503 `avatar_busy` in 12.4 ms**, before the
first returned **200 in 481.2 ms**. Peak active decoders remained one. All 30
health responses were 200, maximum 31.4 ms. Kernel peak was **281,538,560 bytes
(268.5 MiB)**; sampled API RSS was **334,487,552 bytes (319.0 MiB)**. OOM/kill
counters remained zero and the owned container stopped with exit 0.

`client-maxbody.mjs`, `server-maxbody.mjs`, `maxbody-results.json`,
`maxbody-final-state.json`, `docker-maxbody.json` and `maxbody-assertions.log`
preserve the single-pair evidence. The initial harness asserted `.code` instead
of the API's actual `.error` field after saving all responses; `maxbody.log`
retains that harness-only assertion failure. Corrected assertions against the
saved raw data passed without sending another pair. These observations close
the named body/admission case; actual-target and other stated limits remain.

## V2 final integration gates

The migration and resource proof introduced a server runtime correction, so the
full three-project browser suite ran again. Existing V1 inspected visual captures
remain valid for the unchanged UI; physical/native limitations above remain open.

- `pnpm --filter @memory-shoebox/web exec tsc -b --force`: passed before workspace
  verification, avoiding stale incremental types (`forced-types.log`).
- `pnpm check`: exit 0 (`check-verified.log`). Format, lint, all workspace types,
  web/email builds, root 299, shared 367, emails 56, web 2,447 and server 2,433
  tests passed. Seven existing environment-gated tests were skipped: three delegated-Linux
  runtime cases on macOS, three fake-email PDF cases without the server
  package's Chromium, and one opt-in built-SPA case without
  `STATIC_SPA_BUILT_OUTPUT`. The resource rehearsal establishes its stated local
  bound, not those missing isolated-runtime checks.
- `pnpm exec playwright test -c playwright.comment-tagging.config.ts`: all 60
  tests passed across three projects, no retries/skips, 1.6 minutes
  (`browser-final.log`). No provider calls or real mail were used.

Actual earlier workspace failures and scoped corrections remain in the evidence:
Sharp type imports, the email public-export expectation for the new tag template,
and a SignIn unit helper that mixed the distinct create-session and current-me
response shapes. The corrected helper explicitly maps the session marker; schemas
were not relaxed. Focused email tests passed 2/2 and all SignIn/setup helper
consumers passed 39/39. The final full check includes those corrections. Existing
jsdom `scrollTo()` notices and the third-party build directive warning remain;
they did not fail the checks.

The final resource image, browser run and current source share the selected
12 MP runtime behavior. Only erased type annotations and unit-test fixtures
changed after the image build; source hashes and that distinction are retained
in `source-manifest.json`. No repeated resource or visual sweep was required.
Independent task/whole-branch review and consolidated Downloads Markdown/PDF/archive
delivery remain controller-owned. Actual-target preflight and the native/assistive
limitations above remain operator gates. Publication and deployment did not run.
