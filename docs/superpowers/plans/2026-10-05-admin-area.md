# Admin area implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Finish the five admin surfaces and retire the visual reference package after acceptance.

**Architecture:** Focused React surface modules reuse the existing theme and system components. TanStack Query owns schema-validated reads and explicit mutations, separate from picker caches. The existing server remains unchanged.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-area-design.md`

## Global Constraints

- Read AGENTS.md, `/Users/juanpablosarmiento/src/jpsyx/AGENTS.md`, relevant docs and rules. Work only in the supplied worktree. No server or generated skills edits.
- Each task uses red/green TDD for behavior, watches the new tests fail before implementing, and commits only its own files. Do not push, merge or create PRs.
- Preserve the existing visual world and drawn scope. Use public JSDoc, readonly input contracts, one component per file, functions at most 45 lines, no `any`, no em dashes or `resolve...` names.
- Load applicable skills. Do not dispatch nested agents. Controller provides review.
- Existing API contracts and implementations outrank historical aspirational prose. No fictional data or endpoint in shipped UI.
- Query reads and mutations use the shared schemas and `apiFetch`. Use hook-level mutate handlers and disable controls while pending; failures retain input. Do not fetch admin payloads for a non-admin.
- Each route uses `staticData: { hasOwnBar: true }`, real TopBar back to `/account`, and active-role gating. Authority changes refresh route context before continuing.
- Update only each task's corresponding route smoke assertion and response fixture in `apps/web/src/routes/rendering.test.tsx` when replacing its placeholder. Preserve the other route cases.
- Keep browser evidence and coordination artifacts under ignored `.playwright-mcp/step9-acceptance/` and this plan's SDD workspace. Update relevant documentation as part of each task.

## Review Focus

1. Concurrent last-admin or role change: refuse before writes and preserve a server refusal rather than showing success.
2. Group rename succeeds while member replacement fails: disclose the completed part and preserve a safe retry.
3. Group deletion usage changes with identical counts: replace consent and require another confirmation.
4. Timezone preview and catalog changes: report the committed response's impact and current reconciliation links.
5. Historical labels, removed subjects, next-page failure and near-midnight events: preserve history and Shoebox-local grouping without fabricated existence.

### Task 1: Members

**Files:** Create `apps/web/src/api/adminMembers/` and `apps/web/src/surfaces/Members/`; modify `apps/web/src/routes/_app/members.tsx`, `apps/web/src/api/members/members.ts`, `docs/administration.md`. Reuse `api/inviteMember.ts` admin directory and invitation helper. Exact test owners: `api/adminMembers/adminMembers.test.ts`, `surfaces/Members/MembersSurface/MembersSurface.test.tsx`; split focused cases when needed.

**Interfaces:** Consume shared AdminMemberDto, memberSuggestionResponseSchema (inspect exact exported name), listMembersResponseSchema, mutation schemas and existing apiFetch/jsonInit. Produce `MembersSurface(): ReactNode`, named administration request helpers and their schema-validated responses. Link changes with `actorMemberId` and groups via `/groups`; preserve separate picker/admin cache keys.

- [x] Write request tests for normalized invitation/name suggestion, PATCH role, DELETE member/invitation/device and POST resend. Test response validation, opaque IDs/query encoding and 204 handling.
- [x] Write rendered tests: pending/expired invitations; suggestion prefill without overwriting a deliberate edit; role save; last active admin Save and Remove disabled with reason and no fetch; invited admin excluded; concurrent `members_last_admin` remains open; removal retains content copy; resend throttling; revoke device, including own/current; non-admin no privileged read; failed read Retry; field errors and pending controls.
- [x] Run `pnpm --filter @memory-shoebox/web exec vitest run src/api/adminMembers src/surfaces/Members` and confirm failure for absent functionality before implementation.
- [x] Implement focused helpers/components, actual reads and writes, informative roles/device/pending copy and responsive labeled table rows. Integrate the route. Invalidating members/groups/observations/archive and me plus router context must reflect self authority changes. Repair only the obsolete member-picker route-not-built comment in the existing helper.
- [x] Update administration docs for this web flow. Run the owning tests, `pnpm --filter @memory-shoebox/web type-check` and changed-file lint/format checks. Expected: pass. Commit as `feat: implement member administration` and report red/green commands and outputs.

### Task 2: Groups

**Files:** Create `apps/web/src/api/adminGroups/`, `apps/web/src/surfaces/Groups/`; modify `apps/web/src/routes/_app/groups.tsx`, `apps/web/src/api/groups/groups.ts`, `docs/administration.md`. Test owners: `api/adminGroups/adminGroups.test.ts`, `surfaces/Groups/GroupsSurface/GroupsSurface.test.tsx` and focused helper tests.

**Interfaces:** Consume shared listGroupsResponseSchema/adminGroupDtoSchema/replaceGroupMembersResponseSchema/groupUsageResponseSchema and apiFetch; reuse admin directory from Task 1 for PeopleField options. Produce `GroupsSurface(): ReactNode`, create/rename/replace/delete helpers; DELETE takes displayed confirmationToken as a query parameter, never a body.

- [x] Add failing request tests for every method, membership replacement and confirmation token encoding.
- [x] Add rendered tests: inline creation with member chips; rename and add/remove; removed identities excluded; partial rename success with failed membership replacement retry; both narrowing/widening consequences and names; empty only rule protection; usage failure disables delete; stale `groups_usage_changed` or `groups_confirmation_required` parses fresh usage and requires a new click, no automatic retry; no-access role; Retry read. Inspect actual error codes/details in server/shared first.
- [x] Run owning tests and watch expected failures before implementation.
- [x] Implement focused dialogs/form/read lifecycle using existing PeopleField mode members. Use exact usage response to render both directions and obtain token; keep completed partial edits visible. Invalidate admin/picker groups, items/timeline, presence, activity and me after authority changes. Replace obsolete route-not-built group-picker comment only.
- [x] Update docs. Run `pnpm --filter @memory-shoebox/web exec vitest run src/api/adminGroups src/surfaces/Groups`, package types and changed-file lint/format. Expected: pass. Commit as `feat: implement group administration`.

### Task 3: Shoebox settings

**Files:** Create `apps/web/src/api/adminSettings/`, `apps/web/src/surfaces/Settings/`; modify `apps/web/src/routes/_app/settings.tsx`, `docs/administration.md`. Tests own the created helper and surface directories.

**Interfaces:** Consume getSettingsResponseSchema/updateSettingsResponseSchema/mailHealthResponseSchema and actual PATCH query contract. Produce `SettingsSurface(): ReactNode`, settings query/save/preview helpers. Reuse existing mailHealthQueryOptions and account/public-settings keys.

- [x] Write failing transport tests proving preview in query and removed from body, exact six-key nested API contract, schema refusal and responses.
- [x] Write rendered tests for loaded/saved name, arrangement and sender; pending/error retain values; full IANA timezone options; preview counts and explicit confirmation; changing candidate zone clears preview; failed preview no save; save recomputes consequences and actual milestone mismatch links; storage totals; safe mail diagnoses and health recheck; non-admin no reads; read Retry. Use no endpoint for test email.
- [x] Watch owning tests fail before implementation.
- [x] Implement focused settings sheets matching the drawn reference. Reuse live timeline prints/empty footprint for the miniature. Show explicit saves and feedback. Preview timezone before confirming and display returned moved/burst/milestone consequences after save. Invalidate settings, me/router, public settings, timeline/items, presence/activity as appropriate. Present actionable safe diagnosis, refetch health for verification, and expose no invented public URL or sender-name field. Document the absent test-email route as a specification gap, not delivery success.
- [x] Update docs and run `pnpm --filter @memory-shoebox/web exec vitest run src/api/adminSettings src/surfaces/Settings`, package types and changed-file lint/format. Expected: pass. Commit as `feat: implement Shoebox settings`.

### Task 4: Presence and historical changes

**Files:** Create `apps/web/src/api/observations/`, `apps/web/src/surfaces/Presence/`, `apps/web/src/surfaces/Changes/`; modify `_app/presence.tsx`, `_app/changes.tsx` under `apps/web/src/routes`, the admin action owner under `surfaces/Item/`, and `docs/administration.md`.

**Interfaces:** Consume shared presenceResponseSchema/itemViewersResponseSchema/activityResponseSchema, real item query and account timezone. Produce `PresenceSurface(): ReactNode`, `ChangesSurface(): ReactNode`, encoded observation query helpers, and tested `activitySentence`/day grouping helpers. Filters are family/actorMemberId/subjectId on `/changes`, itemId on `/presence`, validated in routes. Historical subject IDs may be setting keys, not only UUIDs.

- [ ] Write failing transport tests for presence, item viewers and paged activity including query encoding and filter-specific query keys.
- [ ] Write rendered presence tests for server ordering, never-arrived/zero figures, sign-in vs seen copy, item viewer distinctions, unavailable item/viewers Retry, admin item link and forbidden role. Assert no manufactured viewer totals or unseen-member claims.
- [ ] Write change tests for all kind/detail sentences, added/removed members and retroactive visibility copy, local days around UTC midnight, historical labels/devices after deletion, combined filters, opaque cursor page append/day grouping, page-failure retry, empty log versus empty filters, loading/error/retry and no admin fetch for another role.
- [ ] Watch tests fail, then implement focused components and routes with URL-derived filters, server order and timezone formatting. Preserve actor/subject labels and avoid media lookup links. Show database absences in plain language. Add admin-only Who opened this link from item to itemId presence. Ensure Members actor link and Changes clear filters work.
- [ ] Update docs, including access logs as a distinct deployment-managed operational record. Run `pnpm --filter @memory-shoebox/web exec vitest run src/api/observations src/surfaces/Presence src/surfaces/Changes`, relevant item/routes tests, package types and changed-file lint/format. Expected: pass. Commit as `feat: implement presence and historical changes`.

### Task 5: Acceptance and reference retirement

**Files:** Create `e2e/admin/` live, contract, keyboard and visual coverage; correct observed email action-link contrast under `packages/emails/`; update `docs/e2e.md`, `docs/web.md`, `docs/architecture.md`, and create `docs/prds/2026-09-27-memory-shoebox/plan/step-9-verification.md`. After review delete reference directory and docs; update all affected docs, AGENTS.md, README.md, package.json, pnpm-workspace.yaml, pnpm-lock.yaml, Dockerfile, .dockerignore and existing visual comparison test helpers/scripts requiring it. No server changes.

**Interfaces:** Consume all four completed surface tasks and existing isolated fake-S3/SQLite browser fixtures. Produce reproducible production acceptance, saved side-by-side evidence before deletion, self-contained browser tests and a fresh workspace check.

- [ ] Before product changes, add failing browser scenarios using real API for Running the Shoebox, last-admin role/removal guards, invite suggestions/resend/revoke, devices, both group deletion directions/confirmation changes, settings preview/save, presence and changes filters. Never claim fixtures prove live APIs. Own per-case data, preserve other cases and cache sessions; use production topology.
- [ ] Add complete five-surface state comparison matrix at 400/768/1280 in Day/Night while the reference server runs. Capture each URL and corresponding real screen, inspect pairs and record any justified contract differences. Include keyboard/dialog focus and accessibility names/errors. Keep screenshots under the ignored acceptance directory.
- [ ] Run and inspect all eighteen surfaces across breakpoints/schemes; include real email HTML/plain text. Attempt actual native 200% zoom and screen-reader traversal with available tools. Report what was actually done, not viewport-equivalence or accessibility snapshots as actual screen-reader acceptance.
- [ ] Fix observed in-scope issues with regression tests and one bounded visual confirmation round. Keep server unchanged. Record remaining impossible acceptance and API gaps honestly; do not delete reference evidence before review.
- [ ] Retire reference package and all specified integration references only after comparisons. Keep durable product decisions unchanged while replacing obsolete historical paths/wording. Convert existing live comparison tests into self-contained production layout assertions or retained captured reference checks so the ordinary browser suite needs no deleted dev server. Existing generated cartoon development media already owned by e2e remains available.
- [ ] Search `apps/ docs/ AGENTS.md README.md Dockerfile .dockerignore pnpm-workspace.yaml package.json` for the retired package word; Expected: no matches. Update lockfile via pnpm, no hand-edited dependency snapshot.
- [ ] Run `pnpm check` after deletion, relevant browser suites and detector once for changed UI. Expected: exit 0, no required-case skip. Update step-9 status based on actual acceptance and record exact results/limitations in its lasting verification doc. Commit as `feat: finish admin acceptance and retire reference scaffolding`.
