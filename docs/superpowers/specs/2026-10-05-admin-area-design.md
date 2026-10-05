# Step 9: admin area design

## Intent and boundary

Finish surfaces 11, 12, 13, 17 and 18 so the family administrator can run the
Shoebox from the web app. Preserve the drawn visual world, existing runtime
contracts, and all previously built flows. This is the architectural path for
an already specified product slice. The request to execute step 9 authorizes
its design, plan, implementation and verification; questions are reserved for
facts that the existing product documents do not settle.

No changes to `apps/server`, new feature, package publication, push, merge or
pull request. Work happens on `feat/admin` in an isolated worktree. The
historical reference directory is retired only after browser comparisons.

## Approach

Use focused surface modules under `apps/web/src/surfaces/`, with TanStack
Query reads and mutations through schema-validated `apiFetch`. Retain separate
admin and picker query keys. Reuse the existing theme, Page, TopBar, Sheet,
SheetHead, Banner, Chip and PeopleField. Each route suppresses the ordinary
product bar and draws the account back link. Check active admin authority at
entry and execution, and do not fetch privileged data for non-admins.

| Approach                                               | Tradeoff                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Focused surfaces using the existing contracts (chosen) | Preserves authority boundaries and the established design while isolating each screen for testing. |
| Put every flow in route files                          | Fewer files, but mixes transport, form state and authority checks in large components.             |
| Introduce a generic admin framework                    | Adds abstraction and behavior that this step does not request.                                     |

## Members

Full administrative directory, roles and last-seen timestamps; invited identities
carry pending or expired invitation copy and resend/revoke controls. An inline
invite form loads email-based name suggestions and pre-fills an editable display
name. Role, removal and device actions use protected-focus dialogs. Changes
link to `/changes?actorMemberId=...`; Groups is reachable from Members.
Last-active-admin demotion and removal are refused before a request, with an
explanation and disabled confirmation. Concurrent server `members_last_admin`
refusals keep the dialog and refresh the directory. Invited admins never count.
Mutation errors remain visible; confirmed writes invalidate related directory,
group, account, timeline and observation caches. Self-demotion refreshes route
authority; self-removal or current-device revocation returns to sign-in.

## Groups

List names, membership chips and directional usage counts. Inline creation and
edit dialog reuse PeopleField in members mode, including invited identities.
Rename and membership replacement are separate server writes: if the second
fails, state records the successful rename and retry cannot imply atomicity.
Deletion first reads `/groups/:groupId/usage`. Render narrowing, widening,
empty-allow-list consequences and affected names before confirmation. Send the
opaque confirmation token in the query. A stale or missing confirmation replaces
the displayed usage with the fresh server response and requires a new explicit
confirmation, never an automatic retry. Read failure cannot enable deletion.

## Settings

Resolved name, pile arrangement, timezone, sender address and indexed storage
come from `/settings`; diagnosis comes from `/mail/health`. Name, arrangement
and sender saves have explicit pending/error/success states. Arrangement has a
live miniature using real visible archive prints, or the existing empty print
footprint when there are none, without fabricated family imagery. A timezone
selection is previewed using `PATCH /settings?preview=true` before a separate
confirmation write. Show moved-item and burst-ejection counts, and link actual
milestone mismatches to the existing reconciliation flow. Render recomputed save
consequences rather than treating the preview as durable. Refresh account,
public settings, archive, activity and presence data after affected writes.

Mail diagnosis uses application-owned safe server facts and their exact cause.
The reference's test-email action has no route in the delivered server; do not
invent an endpoint or imply delivery. Keep its absence explicit in the durable
verification record. Rechecking diagnosis can refetch the existing health read,
which includes provider verification and its documented cache.
The drawn page has no public-base-URL or sender-name editing fields; expose no
new fields. Configuration diagnosis points to the existing configuration guide.

## Presence and changes

Presence preserves server ordering and distinguishes Last signed in from Last
seen. Zero figures, invited identities and never-arrived dates remain readable.
`/presence?itemId=...` uses the real item and admin viewer routes, reached from
an admin's item screen. Never infer never-seen from absent viewer rows or claim
an item-wide audience total the response does not supply. State the database
absences in plain words. Server access logs are a separate operational record:
the existing email query parameters may appear there, with deployment-managed
retention; these screens neither display nor erase that log. No server logging
change belongs to this step.

Changes uses URL filters for family, actorMemberId and subjectId and opaque
cursor pagination. Group days and clock times in the Shoebox timezone. Keep
historical labels and devices from the event itself, without lookup-based
rewriting, media links or claims that an opaque subject still exists. Describe
all event kinds and known detail variants in plain sentences, including the
retroactive grant from group membership. Empty, pending, paging-failed and
read-failed states remain distinct and recoverable.

## Accessibility and completion evidence

Match the reference composition at 400, 768 and 1280 CSS pixels in both schemes.
Use semantic headings, named fields and actions, live feedback, readable disabled
controls, focus trapping/restoration, keyboard-only flows and responsive tables
that reflow into labeled rows without document horizontal scrolling. Inspect
all eighteen surfaces, including emails, at 200% genuine browser zoom where the
available browser supports it. Accessibility-tree checks do not count as an
actual screen-reader pass; record any unavailable acceptance honestly.

After comparisons, delete the reference package and its workspace/build/script
entries. Update affected documentation and historical reference wording without
rewriting product decisions. Retain browser comparison evidence and a lasting
step verification record. No case requiring the retired server may remain in
the normal browser suite. Run `pnpm check`, relevant live browser workflows,
and the requested no-reference search after deletion. Report gaps without
calling the step complete when required acceptance remains unverified.
