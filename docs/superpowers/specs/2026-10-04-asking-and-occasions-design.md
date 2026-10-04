# Step 8b: asking and occasions

Date: 2026-10-04
Status: approved by Juan Pablo on 2026-10-04
Scope: surfaces 10, 14 and 15 only

## Intent and sources

A tagged member can ask for a photograph to come down and see that the ask
was recorded. Its uploader or an admin can delete it, or keep it and answer
in their own words. The asker can withdraw. An uploader can also name a dated
occasion, attach photographs and reconcile capture days outside its span.
These are family conversations and archive labels, rather than moderation
tools or albums.

The authority is step 8b, `docs/PRODUCT.md`, the product design spec,
`DESIGN.md`, the removal and milestone API specs, and the merged step 7a
contracts. `docs/architecture.md`, `docs/web.md`, `docs/milestones.md`,
`docs/removals.md`, `docs/e2e.md` and the language/UI/routing rules supply
implementation context. The product specs and prototypes remain read-only.

The prototypes ran on port 5174. All 19 states were opened in Chromium:
five removal states, five queue states and nine milestone states. Screenshots
are retained in the ignored `.playwright-mcp/step8b-prototypes/` directory.
Phone screenshots of `already`, `settled` and `fix` were also inspected.
This is design exploration, not the final visual acceptance matrix.

The isolated branch is `feat/asking-occasions`. Its unchanged baseline
`pnpm test` passed 2,848 tests. No product code has been implemented yet.

## Approach and boundaries

| Approach                                                                                              | Consequence                                                                            | Decision |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Thin route components, shared API schemas, focused surface controllers and existing system components | Matches the existing SPA and makes capabilities, mutations and failure states testable | Use this |
| Copy each prototype into a single stateful component                                                  | Repeats fixture assumptions, permissions and search behavior                           | Reject   |
| Add backend reads or a new picker search language                                                     | Crosses the explicit scope and duplicates settled contracts                            | Reject   |

Keep the existing addresses: `/items/$itemId/removal`, `/removal-requests`
and `/milestones`. The removal route remains a sibling of the item viewer,
using its existing trailing-underscore file-route convention and own top bar.
Milestone management states live under `/milestones`; they are not a separate
public occasion page. Validated search parameters identify the selected
milestone and management mode so refresh and Back can recover a saved
occasion. Unsaved form text and picker changes remain local.

Implement under `apps/web`, with browser tests under `e2e` and matching
documentation under `docs`. Do not change `apps/server`, schemas, migrations,
mail templates, product specs or prototypes. Members, groups, settings,
presence, the change log, upload behavior and the existing item-viewer entry
point are outside this step. Existing account doors already link to these
addresses; this step implements their destinations.

## Units and data ownership

- `api/removals/`: validated item history, paginated open/settled queues,
  creation, decline and withdrawal. Item deletion uses the existing item API.
- `api/milestoneHelpers/`: extend the existing occasion client with detail,
  deletion, attachment deltas, candidates, mismatches and reconciliation.
  Adopt the merged shared request/response schemas for these calls. Preserve
  upload's existing pre-ingest behavior and public helper signatures.
- `api/timeline/selection/` and the timeline query helpers: carry the existing
  server attachment filters in request construction and cache identity.
  Ordinary timeline selections keep their current behavior.
- `surfaces/Removal/`: own-request history, ask form and response handling.
- `surfaces/RemovalRequests/`: queue, request cards, delete and decline dialogs.
  Shared request presentation and dialogs serve both removal surfaces.
- `surfaces/Milestones/`: list, form, span suggestions, attachment picker,
  empty preview and reconciliation controller.
- `system/MilestoneDateFields/` and `system/MilestoneFix/`: reuse the span
  controls and reconciliation presentation, wiring distinct action callbacks
  and controlled per-item targets rather than the placeholder `onDone` action.

Each component has one responsibility. Modules with tests or styles use the
existing directory convention. Do not add barrel files or manually edit the
generated route tree. CSS modules own surface-specific responsive rules.

Use `apiFetch` and shared Zod schemas at every HTTP boundary. The merged
contract allows milestone names up to 200 characters, blurbs up to 280, and
request/decline reasons up to 4,000. The upload-era local 120-character name
schema must not govern this new surface. One-day forms submit `endsOn` equal
to `startsOn`; multi-day forms require both valid ends.

Viewer-dependent query keys include the signed-in member ID. Include queue
state, milestone ID, filter selection and pagination identity where relevant.
Follow opaque cursors, deduplicate by ID, and distinguish an empty page with
a next cursor from the end. Never invent item counts from drawn print counts.

## Surface 10: asking and answering

Load `GET /api/items/:itemId/removal-requests` before offering an action.
The response supplies the item, scoped history and `canRequestRemoval`.
Use the signed-in identity to find the viewer's own newest request. Never
infer request actions from their role: each button requires its DTO capability.

| State      | Presentation and behavior                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask`      | Optional reason, small item preview, uploader and admin audience, Send and Never mind. Explain that requesting changes nothing about the photograph. |
| `already`  | Own open request, original reason or honest no-reason copy, waiting explanation and Withdraw only when `canWithdraw`.                                |
| `uploader` | Incoming requests and the asker's words. Offer Delete only when `canDeleteItem`, and decline only when `canDecline`.                                 |
| `admin`    | Same controls, plus the explanation that the uploader was asked too and can act first. Role affects this explanatory copy only.                      |
| `declined` | Show the actual resolver's name and exact decline reason in body type. Ask again appears only when `canRequestRemoval`.                              |

Own open history takes precedence over an ask form. A person who can both ask
and answer sees their own history alongside the incoming actionable cards;
do not hide either responsibility. A withdrawn own request shows its outcome
and permits a fresh ask when the server allows it. Ask again opens the form
and does not immediately send a second request. Show all scoped incoming
requests, rather than selecting one arbitrarily.

Creation sends the optional reason, retaining failed text. On success use the
returned DTO and refresh item history and relevant caches. Confirm that the
request was recorded and notifications queued, never that mail was delivered.
The prototype's fixed count of admins is fixture copy: the API supplies no
recipient count, so say the uploader and admins were told without inventing it.

Withdrawal calls its request-ID action, shows the returned withdrawn outcome
and refreshes queue counts. It tells the asker the uploader and admins will
be notified, subject to their existing mail preferences. An admin acting on
somebody else's request never gets a Withdraw button.

If asking is unavailable and there is no actionable history, show plain
explanatory copy and the way back rather than an inert ask form. Missing or
inaccessible items use the same unavailable presentation. An item that has
been deleted has no working photograph address, so after a successful delete
leave this item-scoped route for the queue with a confirmation.

## Surface 15: the answer queue

Use the server's `openCount` and `settledCount` for tab labels and figures.
Settled includes deleted, declined and withdrawn requests. List every page;
the open queue is the uploader's scoped queue or the admin's full queue.
A viewer visiting this address gets a clear unavailable message and account
link, with no queue or action controls.

| State       | Presentation and behavior                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open`      | Waiting cards with asker, snapshot uploader, dates and optional reason. Explain that unresolved requests stay open and receive weekly reminders. |
| `deleting`  | Confirmation that the file, photograph and associated discussion go permanently. Confirm through the existing item DELETE route.                 |
| `declining` | Required own words addressed to the asker. Keep text on failure; submit only a nonempty trimmed reason.                                          |
| `settled`   | Outcome, resolver, dates and exact reply for a decline. Deleted items use the ghost frame and have no item link.                                 |
| `none`      | Normal zero-waiting presentation, both server counts and access to settled history even when it is nonempty.                                     |

`media: null` is expected data. With a null item ID render Gone, without an
image or item link. With an existing item ID and null media, explain that the
photograph is unavailable to this reader and omit its preview link. Do not
retry null media or label every null preview Deleted. Live previews alone
may link to the item. Render names and reasons as plain text, with normal
Archivo body typography and wrapping; no HTML or template paraphrase.

Declining settles only the selected request. Deleting the item settles all
its open requests, so invalidate both queue tabs and item history, not just
remove the selected card. The DTO response drives settled rendering.
Changing who can see the item instead navigates to the existing visibility
editor and leaves the request open. It never calls decline or withdraw.
Hide that route when there is no visible item address.

## Surface 14: occasions

Every member may read the list; only uploaders and admins create. Per-row
`canEdit` and `canDelete` govern existing occasion controls. Creator identity
does not grant or restrict editing. Nullable creator metadata needs no fallback
account lookup. An occasion with zero visible items does not reveal whether
restricted attachments exist.

| State         | Presentation and behavior                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`        | Name, blurb, inclusive date span, per-viewer count and capability-gated actions. Follow the list cursor.                                                        |
| `create`      | Name, one date, optional blurb. Explicit submission creates the saved occasion.                                                                                 |
| `create-span` | The same form with the multi-day switch and both ends. A span is one occasion.                                                                                  |
| `created`     | Span candidates from `GET /milestones/:id/candidates?scope=span`, with `isAttached` baseline. Choose photographs or leave the already-saved occasion empty.     |
| `edit`        | Prefilled form using current detail. Saving changes only occasion fields; a resulting mismatch count offers reconciliation.                                     |
| `attach`      | A selectable pile narrowed through the existing timeline language. Save explicit attach and detach deltas.                                                      |
| `fix`         | Out-of-span attachments, explicit per-item day choices for a span, widen the occasion, or acknowledge leaving the photographs as they are.                      |
| `empty`       | Zero visible attachments and a real milestone-band preview. Its date still belongs in the timeline. Offer Attach to an allowed editor.                          |
| `delete`      | Confirmation says only the label and attachments go; photographs stay on their capture days. Use milestone DELETE and its returned name/count for confirmation. |

Creating from nothing never derives dates from candidates. Cancelling the
suggestion step leaves the saved empty occasion. Creating or attaching from
an existing selection uses explicit item IDs, capped by the shared contract,
and only prefills dates when those capture days are actually available.
Do not create a new timeline bulk-selection feature in this step.

There is no in-product action for the prototype's Ask Marisol for hers:
the current data supplies neither a contact nor a messaging workflow. Omit
that fixture-only button rather than render a control that does nothing.

### Attachment narrowing and deltas

Use the current filter controls: typed words find tags and people through
the existing vocabulary endpoints, selecting them narrows the timeline,
and dates use its existing inclusive bounds. The timeline API has no free
text `q` parameter; do not invent one or parse another search grammar.

For an occasion, read the matching attached items with
`attachedToMilestoneId=<id>` and matching available items with that ID plus
`excludeAttached=true`. Combine the two filtered streams into the picker,
preserving attachment membership and deduplicating item IDs. Both branches
carry the same tag, person and date selection and maintain their own cursors.
Filter changes reset read pagination, not the pending attachment delta.

Selection changes address explicit returned item IDs. A collapsed burst's
count is not a set of IDs and pressing its representative never silently
changes all siblings. The created-state candidates retain each item identity,
including burst frames. Selection counts describe chosen item IDs only.

Compute `attach` and `detach` against the observed baseline. Never submit the
visible selected set as the entire occasion's contents, and never detach
unseen or merely filtered-out items. Cancel discards the pending delta.
No-change submission makes no PATCH. Cap each direction at 500, explain the
limit before submission and preserve choices on refusal. A successful delta
uses the returned counts and mismatch count; it changes no capture dates.

### Reconciliation

Read paginated mismatches and the server's full-set `wideningSpan`. Show
the full pending count separately from the loaded page count. Keep day choices
stable by item ID while paging. A multi-day item starts with an explicit
Choose a day option; Move stays unavailable until every submitted item has a
chosen target inside the span. A one-day occasion supplies its sole day.

Move sends `{ mode: "move", moves: [{ itemId, targetOn }] }`; leaving them
sends `{ mode: "acknowledge", itemIds }`. Each action addresses a displayed,
explicit batch of at most 500, then refreshes remaining mismatches. Its copy
names the batch count rather than claiming to have handled unseen pages.
Widen uses milestone PATCH with the server-computed span, including mismatches
beyond the current page. It never derives widening from loaded rows alone.

Use returned `raisedElsewhere` to offer the other occasions needing attention.
After moves, invalidate affected item details, burst reads and timeline/rail
queries; after every occasion or attachment mutation invalidate milestone
detail, list, candidates and mismatches as appropriate. Reconciliation timing,
clock preservation, burst ejection and mail remain server responsibilities.

## Failures, accessibility and visual acceptance

Reads have loading, retry and unavailable states. Preserve confirmed data on
background refresh failure. Writes are explicit, serialized for their target
and protected against rapid duplicate presses. Do not optimistically claim a
deletion, decline, withdrawal or date correction. Keep inputs and picks on
failure and show field-addressed validation, including dotted move target
errors. Re-fetch on stale open-state or attachment conflicts before offering
an action again. Use stable operation-specific copy rather than raw exceptions.

After a transport failure that could have followed a committed write, refresh
the authoritative read before retrying. If an uncertain occasion create
cannot be correlated safely with an existing occasion, do not auto-create
again: explain the uncertainty and let the member inspect the list. Duplicate
occasion names are valid, so name matching alone is not proof of success.

Reuse square sheets, buttons and fields, the paper print edge, label pills,
existing body fonts and theme tokens. Use real links/buttons and `aria-pressed`
on selectable prints. Dialogs trap and restore focus; actions expose pending
state, failures are announced, and field labels remain visible.

At 400px the prototype fix rows squeeze prose into a narrow column, and its
table has a wide intrinsic layout. The implementation keeps those controls
and hierarchy but stacks reconciliation fields and uses wrapping occasion
rows/cards at narrow widths. Neither document horizontal scrolling nor
letter-by-letter prose wrapping meets acceptance. Dialog actions also wrap.

## Verification and definition of done

Use red/green TDD for behavior, API and component integration. Required cases:

- Viewer sees no decline/delete controls; admin sees no proxy withdrawal.
- Blank optional ask, required decline reason, exact responder words, Ask
  again, multiple requests, and withdrawal success/failure/conflict paths.
- All three settled outcomes, server tab counts and pageable settled history
  with zero open requests; deleted media causes neither broken images nor links.
- Single-day and span payloads, 200-character names, failed form retention,
  empty occasion, editing mismatch transition and label-only deletion.
- Filtered attached/available reads, distinct query keys/cursors, selections
  surviving narrowing, explicit delta only and burst representative identity.
- One-day and chosen per-item multi-day moves, acknowledgment, full-set
  widening across pages, batch limits, dotted errors and raisedElsewhere.
- Cache refresh after delete/decline/withdraw/attach/reconcile and no duplicate
  writes from rapid activation or uncertain transport outcomes.

Add real-API browser scenarios using the established isolated E2E catalog and
local bucket stand-in. Exercise asking and resolution as asker, uploader and
admin; withdrawal must be observed by the uploader and verified against the
queued notification. Mail preference/actor rules are already backend-owned;
never send real mail during tests. Cover occasion creation, attachment,
reconciliation and deletion with photographs still present.

Compare all 19 states with their prototype URLs at 1280, 768 and 400px in
both color schemes. Use controlled responses for hard-to-reach visual states,
identified separately from live API tests. Manually traverse asking, declining
and attaching using only the keyboard. Check all three surfaces at 200% zoom
for horizontal scrolling, clipping and usable focus. Record screenshots and
remaining manual acceptance honestly.

Run `pnpm check` and the focused browser suite before claiming completion.
Update `docs/web.md`, `docs/e2e.md`, `docs/milestones.md`, `docs/removals.md`
and the step progress record with implemented behavior and verification
evidence. Update the architecture progress note when warranted; no architectural
boundary changes are required. Leave the feature branch/worktree for review;
push, merge and publication require an explicit user request.
