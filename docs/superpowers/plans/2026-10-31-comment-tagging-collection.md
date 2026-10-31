# Combined Member Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a member-filtered archive containing visible photos and videos they uploaded or were photo-tagged in.

**Architecture:** Add one member dimension to the existing shared selection and SQL predicate. Reuse archive rows, counts, rail, facets, bulk selection, and theater navigation; the web adds only an identity heading and removable filter.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Prepared for implementation review on 2026-10-31. No implementation or passing feature tests are claimed.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- Membership is joined through `people.member_id`; never match names.
- Apply reader visibility AND (uploaded by member OR photo-tagged member), then all other selected filters.
- An overlapping item appears and counts once. Neither comment tagging nor photo tagging grants access.
- Keep videos, historical removed-member collections, and existing photo-tag-only `person` filters.
- Empty copy: “No photos or videos to show.” Never disclose hidden totals.

## Review Focus

- Items matching both union arms: C1 asserts one row/count and no duplicated burst frames.
- Hidden uploaded or photo-tagged items: C1 asserts absence in every count, row, facet, and navigation response.
- A member switch while pages are in flight: C2 tests query-key isolation and stale result rejection.
- Unknown and removed member IDs: C1/C2 pin empty unknown state and authorized historical access.
- Existing person/date/tag filters and cursor reuse: C1/C2 test AND semantics and fingerprint mismatch.

---

## File responsibilities

`TimelineSelection` is the HTTP/client selection; `TimelineFilter` is its SQL
representation. Only `makeSelectionExpressionFromFilter` adds the union. Consumer
changes carry the new field, never duplicate the predicate. Collection identity
reads use their own narrow route instead of the admin-shaped members response.

### Task C1: Member selection through every archive consumer

**Files:** Modify `packages/shared/src/timeline/selection.ts`,
`packages/shared/src/timeline/timeline.ts`, `packages/shared/src/mediaPosition.ts`,
`packages/shared/src/mediaPreview/mediaPreview.ts`,
`apps/server/src/archive/selectionFilterHelpers.ts`,
`apps/server/src/archive/timelineCursorHelpers/timelineCursorHelpers.ts`,
`apps/server/src/routes/timelineRoutes.ts`, and the concrete selection consumers
`apps/server/src/routes/filters.ts`, `apps/server/src/routes/bursts.ts`,
`apps/server/src/media/readMediaNeighbors.ts`,
`apps/server/src/media/readMediaPosition.ts`,
`apps/server/src/media/readMediaPreviews.ts`,
`apps/server/src/routes/items/itemsSeenRoute.ts`, and
`apps/server/src/routes/items/bulkEditItemsRoute.ts`. Inspect central-filter
callers using the inventory below; do not duplicate SQL in them. Create
`packages/shared/src/memberCollections.ts`,
`apps/server/src/routes/memberCollections.ts`,
`apps/server/src/members/readMemberCollectionIdentity.ts`, and
`apps/server/test/routes/memberCollection.test.ts`. Modify shared export allowlist
and `apps/server/src/createApp/createApp.ts`. Extend
`apps/server/test/archive/selectionFilterHelpers.test.ts`.

**Interfaces:** `TimelineSelection.member?: string` is a UUID; it maps to
`TimelineFilter.memberId?: string`. The archive query also uses `member`, while
the existing photo-tag parameters remain `people` on the API and `person` in
the browser URL. `hasContentFilter` includes member selection. Add it to cursor
fingerprints and selection normalization, retaining deterministic keys.

`GET /api/member-collections/:memberId` returns
`{ member: MemberRef | null }`, authenticated, with no email, totals, role, or
status. Known retained accounts return their stable identity; unknown IDs return
null. All data rows still use the standard visibility predicate. Produce
`readMemberCollectionIdentity(options: Readonly<{ database: DatabaseExecutor;
b2: B2Client; memberId: string; now: string }>): Promise<MemberRef | null>`.

Use a correlated EXISTS joining `item_people` to `people` on ID inside the OR
with `items.uploaded_by`. Do not join matching tags into the outer item query.
Use the existing uploader/capture and item-person indexes first; add a new index
only if an EXPLAIN fixture demonstrates an uncovered lookup.

- [ ] **Red:** Build one fixture with uploaded-only, tagged-only, overlap, video, same-name ad-hoc, other member, and two inaccessible items:

```ts
expect(visibleItemIds).toEqual([uploadedId, taggedId, overlapId, videoId]);
expect(resultCount).toBe(4);
expect(new Set(visibleItemIds).size).toBe(4);
expect(hiddenItemIds.every((id) => !serializedResponse.includes(id))).toBe(
  true,
);
expect(wrongMemberCursor.statusCode).toBe(400);
```

Pin rail/date counts, facet counts, burst covers/frames, seen updates, bulk selected
IDs, media positions/neighbors, filtered attachment picking, and pure person
filters against the same expected fixture. Assert unknown IDs yield zero rows
without distinguishing hidden account/content counts.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/server test test/routes/memberCollection.test.ts test/archive/selectionFilterHelpers.test.ts`; run shared selection/media schema tests.
- [ ] **Green:** Extend the shared field and central predicate. Inventory with `rg -l 'TimelineSelection|makeTimelineFilterFromQuery|makeSelectionExpressionFromFilter' apps/server/src packages/shared/src`; inspect each result for manual field copies. Update all selection copies in timeline, rail/facets, bursts, seen, bulk, milestone attachments, media-position and preview handlers. Readers already receiving the complete filter need no redundant edit. Record the touched inventory in the task commit.
- [ ] **Verify:** Rerun focused tests plus existing timeline/media-preview/bulk tests. Check a representative query plan against the fixture. Update `docs/archive.md`, `docs/shared.md`, and `docs/theater.md`.
- [ ] **Commit:** `feat: filter the archive by member uploads or photo tags`.

### Task C2: Collection URL, heading, filter, and cache isolation

**Files:** Modify `apps/web/src/routes/_app/index.tsx`,
`apps/web/src/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers.ts`,
`apps/web/src/api/timelineHelpers/timelineHelpers.ts`,
`apps/web/src/media/getNavigationSelectionFromView.ts`,
`apps/web/src/surfaces/Timeline/TimelineSurface/TimelineSurface.tsx`,
`apps/web/src/surfaces/Timeline/FilterChips/FilterChips.tsx`, and
`apps/web/src/surfaces/Timeline/EmptyArchive/EmptyArchive.tsx`.
Create `apps/web/src/api/memberCollections/memberCollections.ts`,
`apps/web/src/surfaces/Timeline/MemberCollectionHeader/MemberCollectionHeader.tsx`,
and `apps/web/src/surfaces/Timeline/MemberCollectionHeader/MemberCollectionHeader.test.tsx`.
Extend selection helper tests and `apps/web/src/routes/search.test.ts`.

**Interfaces:** Produce `makeMemberCollectionHrefFromMemberId(memberId: string):
string`, returning `/?member=<encoded uuid>`, in the new API module; the href
contains no prior filters. Extend `TimelineSearch.member?: string`,
`getViewFromSearch`, `makeQueryFromSelection`, `makeSearchFromSelection`, and
`isSelectionActive`. Cache identity and every archive page by the complete member
selection and existing authority lifetime. Consume A3's avatar component.

Render the unique name, avatar, explanatory “Photos and videos uploaded by or
photo-tagged with Jorge” copy, and one removable member filter above the existing
pile. Clearing it retains additional filters the reader chose afterward. “Back
to comment” is rendered only when T5 supplies a valid in-memory return journey;
direct/shared collection URLs work without one. No new profile tabs/navigation.
Keep a generic heading when identity is unknown and show the same empty copy.

- [ ] **Red:** Assert round-trip selection and link construction:

```ts
expect(makeMemberCollectionHrefFromMemberId(memberId)).toBe(
  `/?member=${memberId}`,
);
expect(
  makeQueryFromSelection({ tags: [], people: [], member: memberId }).get(
    "member",
  ),
).toBe(memberId);
expect(
  screen.getByText("Photos and videos uploaded by or photo-tagged with Jorge"),
).toBeVisible();
expect(screen.queryByText(hiddenTotal)).not.toBeInTheDocument();
```

Also test removing only the member filter, unknown/removed identity, failed identity
fetch with retry, member-to-member navigation during an in-flight page read, and
new-tab entry without session journey data.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/web test src/api/timelineHelpers src/surfaces/Timeline/MemberCollectionHeader src/routes/search.test.ts`.
- [ ] **Green:** Implement the heading and narrow identity query. Carry member through cursor/query keys, timeline memory identity, bulk selection, media preview/position, and theater selection. Do not hand-spread only the preexisting fields.
- [ ] **Verify:** Rerun tests and web type check. Update `docs/archive.md` and `docs/theater.md`. T5 owns actual draft/scroll restoration.
- [ ] **Commit:** `feat: show member collections in the existing archive`.
