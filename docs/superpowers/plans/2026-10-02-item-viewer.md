# Step 6b: One Photo, One Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put surfaces 3 (one photo) and 4 (one video) live on `/items/$itemId` against step 5a's item routes, and wire the pile so a print opens them.

**Architecture:** One `ItemDetail` query per permalink, fetched by the component (never a route loader, because every `GET` counts an open). Every write puts its response straight into that cache entry with `setQueryData`, all writes on one item share one mutation scope, and every control is drawn from `ItemCapabilities` alone. The video transport becomes a keyboard slider whose marks come from the contract's `durationMs`.

**Tech Stack:** React 19, Mantine 9, TanStack Router 1 (file routes), TanStack Query 5, Zod 4, Vitest + Testing Library (jsdom), Playwright.

**The step design is binding:** [`docs/superpowers/specs/2026-10-02-item-viewer-design.md`](../specs/2026-10-02-item-viewer-design.md). Read it before Task 1. Decision numbers below ("decision 6") refer to it.

---

## Ground rules for every task

- Work in the worktree `/Users/juanpablosarmiento/src/worktrees/jpsyx/feat/item-viewer` on branch `feat/item-viewer`. Commit after every task.
- Read `AGENTS.md`, `docs/rules/typescript.md`, `docs/rules/styling.md` and `docs/web.md` once before starting. The rules that bite most often here:
  - `function` keyword for top-level functions, arrow functions inside. Braces on every `if`. No `for`/`while` in `apps/web` (e2e specs may loop, as `e2e/pile.spec.ts` does).
  - Non-exported top-level helpers start with `_`. Every exported function, type and constant has a docstring.
  - A React component's props type is always called `Props`. One component per file. Ternaries, never `&&`, for conditional JSX.
  - Readonly at the parameter (`Readonly<Props>`, `readonly T[]`), mutable everywhere else.
  - Naming: `make{Target}From{Source}` for a free function building a new value, `get{Target}From{Source}` for one returning a value read from its source, a copy function is named after the copy (`commentsHeading`), and **never** a function called `resolve…`.
  - No em dashes anywhere, in code, comments or docs.
  - Imports in `apps/web` use the `@/` alias and **no** file extension.
- Commands, from the worktree root:
  - One web test file: `pnpm --filter @memory-shoebox/web exec vitest run <path relative to apps/web>`
  - Web types: `pnpm --filter @memory-shoebox/web type-check`
  - Lint: `pnpm lint`
  - Everything: `pnpm check`
  - End to end: `pnpm exec playwright install chromium` once, then `pnpm test:e2e` (or `pnpm test:e2e e2e/item` for one directory). Not part of `pnpm check`.
- **Never touch `apps/server`, `packages/shared`, `.agents/`, `.claude/skills/`, `.cursor/skills/` or `.opencode/`.**
- The e2e catalog uploads no objects (`e2e/support/archive.ts`), so every `<img>` and `<video>` fails to load in Playwright. Anything a spec asserts must hold with no media loaded, which is one reason the transport reads its duration from the contract.

## File map

**Created**

| File                                                                                                                                                                            | Responsibility                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/testing/itemFixtures.ts`                                                                                                                                          | `makeItemDetail`, `makeComment`, `makeBurstFrame`, `makeBurstDetail`, the capability sets, the ids |
| `apps/web/src/testing/itemHarness.ts`                                                                                                                                           | `respondWithItem` and `renderItem`, the canned server and render for the item route                |
| `apps/web/src/api/items/items.ts` (+ test)                                                                                                                                      | The item query and the five `ItemDetail`-returning writes, the delete, the download href           |
| `apps/web/src/api/comments/comments.ts` (+ test)                                                                                                                                | Create, edit, delete a comment                                                                     |
| `apps/web/src/api/reactions/reactions.ts` (+ test)                                                                                                                              | Set and clear a reaction, on an item and on a comment                                              |
| `apps/web/src/api/visibilityRules/visibilityRules.ts` (+ test)                                                                                                                  | `findOrCreateVisibilityRule`                                                                       |
| `apps/web/src/api/members/members.ts` (+ test)                                                                                                                                  | `GET /api/members` against step 8a's contract, local schema                                        |
| `apps/web/src/api/groups/groups.ts` (+ test)                                                                                                                                    | `GET /api/groups` against step 8a's contract, local schema                                         |
| `apps/web/src/system/Chip/ChipLink.tsx`                                                                                                                                         | A chip that is a link, for people and tags                                                         |
| `apps/web/src/system/Talk/CommentEditor.tsx`                                                                                                                                    | The edit form inside a comment                                                                     |
| `apps/web/src/system/Talk/CommentOwnActions.tsx`                                                                                                                                | Edit and Delete under your own comment, and the delete dialog                                      |
| `apps/web/src/system/VideoFrame/TransportSlider.tsx`                                                                                                                            | The scrubber as a `role="slider"`                                                                  |
| `apps/web/src/system/VideoFrame/TransportMarks.tsx`                                                                                                                             | The pinned-comment marks and the pending mark, outside the slider                                  |
| `apps/web/src/surfaces/Item/itemCopy/itemCopy.ts` (+ test)                                                                                                                      | Every kind-aware string, and the failure sentences                                                 |
| `apps/web/src/surfaces/Item/itemWrites/itemWriteScope.ts`                                                                                                                       | The scope, the pile-staleness helper, the refetch-on-refusal helper                                |
| `apps/web/src/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates.ts` (+ test)                                                                                           | Pure updates of a cached `ItemDetail`                                                              |
| `apps/web/src/surfaces/Item/itemWrites/useItemDetailWrite.ts`                                                                                                                   | The generic write that answers with an `ItemDetail`                                                |
| `apps/web/src/surfaces/Item/itemWrites/useItemEdits.ts`                                                                                                                         | Tags, people, description, capture date, visibility                                                |
| `apps/web/src/surfaces/Item/itemWrites/useConversation.ts`                                                                                                                      | Comments and both reaction sets                                                                    |
| `apps/web/src/surfaces/Item/itemWrites/useDeleteItem.ts`                                                                                                                        | The delete                                                                                         |
| `apps/web/src/surfaces/Item/ItemSurface/ItemSurface.tsx` (+ `__tests__/`)                                                                                                       | The query and the four states                                                                      |
| `apps/web/src/surfaces/Item/ItemSurface/ItemNotHere.tsx`, `ItemLoading.tsx`, `ItemFailed.tsx`                                                                                   | Those states                                                                                       |
| `apps/web/src/surfaces/Item/ItemViewer/ItemViewer.tsx`, `ItemMediaColumn.tsx`, `ItemSheets.tsx`, `useWayBack.ts`, `useVideoTransport.ts`                                        | The page once the item is in hand                                                                  |
| `apps/web/src/surfaces/Item/PhotoFrame.tsx`, `ItemMeta.tsx`, `ItemReactions.tsx`, `PinningSheet.tsx`                                                                            | The left column's pieces                                                                           |
| `apps/web/src/surfaces/Item/SiblingStrip/SiblingStrip.tsx`, `SiblingLinks.tsx` (+ test)                                                                                         | The burst strip                                                                                    |
| `apps/web/src/surfaces/Item/ItemTalk/ItemTalk.tsx`, `ItemComment.tsx` (+ test)                                                                                                  | The thread                                                                                         |
| `apps/web/src/surfaces/Item/InThisOne/` (+ test)                                                                                                                                | `InThisOne`, `PeopleRow`, `PeopleEditor`, `TagsRow`, `TagsEditor`, `makePeopleInputsFromNames/`    |
| `apps/web/src/surfaces/Item/WhoCanSee/` (+ test)                                                                                                                                | `WhoCanSee`, `VisibilityEditor`, `visibilityChoice/`                                               |
| `apps/web/src/surfaces/Item/WhenTaken/` (+ test)                                                                                                                                | `WhenTaken`, `CaptureDateEditor`, `DateMoveWarnings`                                               |
| `apps/web/src/surfaces/Item/Describing/` (+ test)                                                                                                                               | The alt text override                                                                              |
| `apps/web/src/surfaces/Item/ItemActions/` (+ test)                                                                                                                              | `ItemActions`, `RemovalAsk`, `DeleteItemModal`                                                     |
| `e2e/item/item.photo.spec.ts`, `item.video.spec.ts`, `item.uploader.spec.ts`, `item.latch.spec.ts`, `item.keyboard.spec.ts`, `item.responsive.spec.ts`, `item.contrast.spec.ts` | End to end                                                                                         |

**Modified**

| File                                                                                                                                                                           | Change                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/web/src/api/client/client.ts`                                                                                                                                            | `jsonInit` takes `PUT`                                                             |
| `apps/web/src/testing/surfaceHarness.tsx`                                                                                                                                      | `recordedRequests()`, which knows the method                                       |
| `apps/web/src/system/labelHelpers/labelHelpers.ts` (+ test)                                                                                                                    | Wall clock, time of day, capture moment, day and month, frame position, burst span |
| `apps/web/src/system/PeopleField/PeopleField.tsx` (+ test)                                                                                                                     | `role` and `memberCount` optional                                                  |
| `apps/web/src/system/Chrome/TopBar.tsx`                                                                                                                                        | The back link carries `search` and `onClick`                                       |
| `apps/web/src/system/Reactions/Reactions.tsx`, `presentReactions.ts` (+ test)                                                                                                  | Takes the server's answer, traps focus in the picker, `makeSummaryFromChoice`      |
| `apps/web/src/system/Talk/Composer.tsx`, `CommentRow.tsx` (+ test)                                                                                                             | Really send, edit and delete                                                       |
| `apps/web/src/system/VideoFrame/VideoFrame.tsx` (+ test)                                                                                                                       | Controlled position, duration from the contract, slider, marks layer               |
| `apps/web/src/system/system.module.css`                                                                                                                                        | `.scrubberSlider`, `.scrubberMarks`, `.sibling[aria-current]`                      |
| `apps/web/src/system/Pile/Print.tsx`, `BurstStack.tsx`, `PileItems/PileItems.tsx`, `PileItems/BurstStackItem.tsx` (+ `Pile.test.tsx`)                                          | Fanned frames are `BurstFrameRef`s and open the viewer                             |
| `apps/web/src/api/bursts/bursts.ts`, `apps/web/src/api/seen/seen.ts`                                                                                                           | The shared `burstFramesResponseSchema`; the stale `frameSchema` goes               |
| `apps/web/src/surfaces/Timeline/` (`TimelinePile`, `ArchiveBody`, `DayStream`, `DayBlock/DayBlock`, `TimelineSurface/useTimelineData`, `TimelineSurface/useBurstFan/` + tests) | Frame type, and `onOpenItem` threaded down                                         |
| `apps/web/src/routes/_app/items.$itemId.tsx`                                                                                                                                   | Renders `ItemSurface`; no loader                                                   |
| `apps/web/src/routes/rendering.test.tsx`                                                                                                                                       | `/items/abc` is now "This one is not here."                                        |
| `e2e/support/database.ts`                                                                                                                                                      | `readItemViewsForMember`                                                           |
| `e2e/pile.spec.ts`                                                                                                                                                             | The fan test comes off `fixme`                                                     |
| `docs/web.md`, `docs/e2e.md`, `docs/prds/2026-09-27-memory-shoebox/plan/step-6b.md`, `.../plan/README.md`                                                                      | Documentation                                                                      |

---

## Phase A: foundations

### Task 1: `jsonInit` takes `PUT`, and the harness records methods

**Files:**

- Modify: `apps/web/src/api/client/client.ts` (the `jsonInit` function)
- Modify: `apps/web/src/api/client/client.test.ts`
- Modify: `apps/web/src/testing/surfaceHarness.tsx`

The two set-replacing routes (`PUT /api/items/:itemId/tags`, `/people`) and the two reaction routes are `PUT`s. The harness change lets a test tell `GET /api/items/:id` (which counts an open) from `PATCH /api/items/:id` (which saves a description): same URL, different method.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/api/client/client.test.ts`, importing `jsonInit` alongside the existing imports from `@/api/client/client`:

```ts
describe("jsonInit", () => {
  it("carries a PUT, which the set-replacing routes use", () => {
    const init = jsonInit({ method: "PUT", body: { tags: ["beach"] } });

    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe('{"tags":["beach"]}');
  });
});
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run: `pnpm --filter @memory-shoebox/web type-check`
Expected: FAIL with `Type '"PUT"' is not assignable to type '"POST" | "PATCH"'`. (Vitest strips types, so the type-check is where this test is red.)

- [ ] **Step 3: Widen `jsonInit`**

In `apps/web/src/api/client/client.ts`, change the signature and add one sentence to its docstring:

```ts
/**
 * A request carrying a JSON body.
 *
 * Here rather than in each caller because the header and the stringify are
 * one convention, and two copies of a convention is one convention and one
 * thing to get wrong. `PUT` is the set-replacing routes' method: a tag set, a
 * people set, and a reaction.
 */
export function jsonInit(
  options: Readonly<{ method: "POST" | "PATCH" | "PUT"; body: unknown }>,
): RequestInit {
```

- [ ] **Step 4: Record the method in the harness**

In `apps/web/src/testing/surfaceHarness.tsx`, below `const recorded: string[] = [];` add:

```ts
const recordedLines: string[] = [];

/**
 * Every request as `"METHOD /path?query"` since `respondWith` was last called.
 *
 * `recordedUrls` cannot tell a read from a write at one address, and the item
 * page has exactly that pair: `GET /api/items/:itemId` counts an open, while
 * `PATCH /api/items/:itemId` saves a description and counts nothing.
 */
export function recordedRequests(): string[] {
  return [...recordedLines];
}

const recordedBodies = new Map<string, unknown>();

/**
 * The JSON body last sent with one `"METHOD /path"` request, or undefined.
 *
 * What a write sent is the assertion most of the item page's tests make: a
 * people set that carries a known person by id and a new one by name, a
 * capture date that leaves the clock alone.
 */
export function recordedBodyOf(line: string): unknown {
  return recordedBodies.get(line);
}
```

Inside `respondWith`, change `recorded.length = 0;` to:

```ts
recorded.length = 0;
recordedLines.length = 0;
recordedBodies.clear();
```

and inside the stubbed `fetch`, directly after `recorded.push(String(path));`, add:

```ts
const line = `${init?.method ?? "GET"} ${String(path)}`;
recordedLines.push(line);
if (typeof init?.body === "string") {
  recordedBodies.set(line, JSON.parse(init.body));
}
```

- [ ] **Step 5: Run the type-check and the client test**

Run: `pnpm --filter @memory-shoebox/web type-check && pnpm --filter @memory-shoebox/web exec vitest run src/api/client/client.test.ts`
Expected: type-check clean, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/client apps/web/src/testing/surfaceHarness.tsx
git commit -m "feat(web): jsonInit takes a PUT, and the harness records the method

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Item fixtures and the item harness

**Files:**

- Create: `apps/web/src/testing/itemFixtures.ts`
- Create: `apps/web/src/testing/itemHarness.ts`

Fixtures only, so no red step: they are exercised by every test from Task 7 on. Every id is a real UUID because the responses are parsed with `itemDetailSchema`, whose ids are `z.uuid()`.

- [ ] **Step 1: Write `itemFixtures.ts`**

```ts
import type {
  BurstFrameRef,
  BurstSummary,
  CommentDto,
  ItemCapabilities,
  ItemDetail,
  MediaSource,
  MemberRef,
} from "@memory-shoebox/shared";

/**
 * Canned item payloads, shared by every test that draws surface 3 or 4, and by
 * the pile's tests for a fanned frame.
 *
 * In `testing/` rather than beside a component, because the item surface's
 * suites and the pile's suites both need them, and a fixture reached across
 * two surface folders is a fixture that belongs to neither. Nothing in the
 * product imports this file.
 */

/** The item every test opens unless it says otherwise. */
export const ITEM_ID = "018f0000-0000-7000-8000-00000000f001";

/** A burst, for the strip. */
export const BURST_ID = "018f0000-0000-7000-8000-00000000b101";

/** A tagged person and a tag, so chips carry a name and an id. */
export const PERSON_MATEO_ID = "018f0000-0000-7000-8000-00000000e101";
export const TAG_HOSPITAL_ID = "018f0000-0000-7000-8000-00000000e201";

/** The member who put the item up. Not the viewer `createMeResponse` signs in. */
export const UPLOADER: MemberRef = {
  memberId: "018f0000-0000-7000-8000-00000000c001",
  displayName: "Mamá",
};

/** The viewer `createMeResponse` signs in by default. */
export const SIGNED_IN: MemberRef = {
  memberId: "018f0000-0000-7000-8000-000000000000",
  displayName: "Papá",
};

/** Far enough ahead that no test ever meets an expired signature. */
const FAR_FUTURE = "2099-01-01T00:00:00.000Z";

/** One signed media source, with sensible defaults. */
export function makeSource(overrides: Partial<MediaSource> = {}): MediaSource {
  return {
    url: "https://example.invalid/thumb.jpg",
    expiresAt: FAR_FUTURE,
    width: 400,
    height: 267,
    ...overrides,
  };
}

/** A viewer: comments and reactions only. */
export const VIEWER_CAPABILITIES: ItemCapabilities = {
  canSetVisibility: false,
  canEditTags: false,
  canEditPeople: false,
  canDescribe: false,
  canFixCaptureDate: false,
  canDelete: false,
  canRequestRemoval: false,
  canSeeViewers: false,
};

/** An uploader looking at somebody else's item: the additive half only. */
export const OTHER_UPLOADER_CAPABILITIES: ItemCapabilities = {
  ...VIEWER_CAPABILITIES,
  canEditTags: true,
  canEditPeople: true,
  canDescribe: true,
};

/** The item's own uploader: everything but asking for it to come down. */
export const OWN_UPLOADER_CAPABILITIES: ItemCapabilities = {
  ...OTHER_UPLOADER_CAPABILITIES,
  canSetVisibility: true,
  canFixCaptureDate: true,
  canDelete: true,
};

/**
 * One photograph, 14 September 2026 at 06:41 on the camera's own clock.
 *
 * `capturedAt` is 04:41 UTC and the file carried `+120`, so the wall clock is
 * 06:41 whatever timezone a test's Shoebox is in.
 */
export function makeItemDetail(
  overrides: Partial<ItemDetail> = {},
): ItemDetail {
  return {
    itemId: ITEM_ID,
    kind: "photo",
    capturedAt: "2026-09-14T04:41:00.000Z",
    capturedOn: "2026-09-14",
    media: {
      thumb: makeSource(),
      display: makeSource({
        url: "https://example.invalid/display.jpg",
        width: 1600,
        height: 1067,
      }),
      poster: null,
      video: null,
      durationMs: null,
      altText: "Mateo, Papá and Mamá, 14 September 2026",
    },
    isUnseen: false,
    uploadedBy: UPLOADER,
    visibility: {
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: null,
    captureSource: "exif",
    capturedAtOffsetMinutes: 120,
    originalCapturedAt: "2026-09-14T04:41:00.000Z",
    altTextOverride: null,
    burstPosition: null,
    burstFrames: [],
    tags: [{ tagId: TAG_HOSPITAL_ID, name: "hospital" }],
    people: [{ personId: PERSON_MATEO_ID, displayName: "Mateo" }],
    milestones: [],
    comments: [],
    reactions: { kinds: [], myKind: null },
    capabilities: VIEWER_CAPABILITIES,
    ...overrides,
  };
}

/** One video, 22 seconds long, with both encodings and a poster. */
export function makeVideoDetail(
  overrides: Partial<ItemDetail> = {},
): ItemDetail {
  const base = makeItemDetail();
  return makeItemDetail({
    kind: "video",
    media: {
      ...base.media,
      poster: makeSource({ url: "https://example.invalid/poster.jpg" }),
      video: {
        webm: makeSource({ url: "https://example.invalid/clip.webm" }),
        mp4: makeSource({ url: "https://example.invalid/clip.mp4" }),
      },
      durationMs: 22_000,
    },
    ...overrides,
  });
}

/** A frame's id, from its 1-based position: dense, so 1 to n. */
export function makeFrameIdFromPosition(position: number): string {
  return `018f0000-0000-7000-8000-0000000f${String(position).padStart(4, "0")}`;
}

/** One frame in the strip. */
export function makeBurstFrame(
  position: number,
  overrides: Partial<BurstFrameRef> = {},
): BurstFrameRef {
  return {
    itemId: makeFrameIdFromPosition(position),
    position,
    thumb: makeSource({ url: `https://example.invalid/frame-${position}.jpg` }),
    altText: "Mateo, 14 September 2026",
    ...overrides,
  };
}

/** A burst of `count` frames between 06:41 and 06:44. */
export function makeBurstSummary(
  overrides: Partial<BurstSummary> = {},
): BurstSummary {
  return {
    burstId: BURST_ID,
    visibleFrameCount: 45,
    startsAt: "2026-09-14T04:41:00.000Z",
    endsAt: "2026-09-14T04:44:00.000Z",
    coverItemId: makeFrameIdFromPosition(1),
    hasUnseenFrames: false,
    ...overrides,
  };
}

/**
 * Frame `position` of a burst of `count`, with the whole run in the strip.
 *
 * `burstFrames` is capped at sixty by the server, so a `count` over sixty
 * gets the first sixty here too, which is what the strip's fallback is for.
 */
export function makeBurstDetail(
  options: { position?: number; count?: number } = {},
  overrides: Partial<ItemDetail> = {},
): ItemDetail {
  const { position = 7, count = 45 } = options;
  return makeItemDetail({
    itemId: makeFrameIdFromPosition(position),
    burst: makeBurstSummary({ visibleFrameCount: count }),
    burstPosition: position,
    burstFrames: Array.from(
      { length: Math.min(count, 60) },
      (_unused, index) => {
        return makeBurstFrame(index + 1);
      },
    ),
    ...overrides,
  });
}

/** One comment by somebody else, with sensible defaults. */
export function makeComment(overrides: Partial<CommentDto> = {}): CommentDto {
  return {
    commentId: "018f0000-0000-7000-8000-00000000d101",
    author: {
      memberId: "018f0000-0000-7000-8000-00000000c002",
      displayName: "Abuela Rosa",
    },
    body: "He has your father's chin.",
    atSeconds: null,
    createdAt: "2026-09-14T05:00:00.000Z",
    editedAt: null,
    canEdit: false,
    canDelete: false,
    reactions: { kinds: [], myKind: null },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write `itemHarness.ts`**

```ts
import type { ItemDetail } from "@memory-shoebox/shared";
import { renderAt, respondWith, type Answer } from "@/testing/surfaceHarness";

/**
 * The canned server and the render for the item route, shared by every suite
 * under `surfaces/Item/`.
 *
 * Answers the item itself, the two vocabularies its editors suggest from, and
 * `GET /api/members` and `GET /api/groups` as the `404` they are until step 8a
 * builds them (decision 8). A case that needs a write answered passes it in
 * `routes`; anything unanswered is a `404`, which is the surfaceHarness's own
 * default.
 *
 * @param detail What `GET /api/items/:itemId` answers.
 * @param routes Further answers keyed by `"METHOD /path"`.
 */
export function respondWithItem(
  detail: ItemDetail,
  routes: Readonly<Record<string, Answer>> = {},
): void {
  respondWith(routes, {
    [`GET /api/items/${detail.itemId}`]: { body: detail, status: 200 },
    "GET /api/people": {
      body: { people: [], nextCursor: null, peopleCount: 0 },
      status: 200,
    },
    "GET /api/tags": { body: { tags: [], nextCursor: null }, status: 200 },
    "GET /api/members": {
      body: { error: "not_found", message: "No such route." },
      status: 404,
    },
    "GET /api/groups": {
      body: { error: "not_found", message: "No such route." },
      status: 404,
    },
  });
}

/** The item page for one id, through the real router. */
export function renderItem(itemId: string): ReturnType<typeof renderAt> {
  return renderAt(`/items/${itemId}`);
}

export {
  recordedBodyOf,
  recordedRequests,
  recordedUrls,
} from "@/testing/surfaceHarness";
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @memory-shoebox/web type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/testing/itemFixtures.ts apps/web/src/testing/itemHarness.ts
git commit -m "test(web): item fixtures and the item route's canned server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Label helpers for the viewer

**Files:**

- Modify: `apps/web/src/system/labelHelpers/labelHelpers.ts`
- Modify: `apps/web/src/system/labelHelpers/labelHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `labelHelpers.test.ts` (extend its import list with `burstSpanLabel`, `captureMomentLabel`, `dayMonthLabel`, `framePositionLabel`, `getWallClockFromCapture`, `timeOfDayLabel`):

```ts
describe("getWallClockFromCapture", () => {
  it("reads the clock the file carried when it carried an offset", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T04:41:00.000Z",
        offsetMinutes: 120,
        timezone: "America/New_York",
      }),
    ).toEqual({ date: "2026-09-14", time: "06:41" });
  });

  it("falls back to the Shoebox's timezone when the file carried none", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T04:41:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-14", time: "06:41" });
  });

  // The case the server's own rule exists for: 23:30 UTC is already the next
  // day in Madrid, and the day decides which pile the photograph sits on.
  it("puts a late photograph on the local day, not the UTC one", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T23:30:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-15", time: "01:30" });
  });
});

describe("timeOfDayLabel", () => {
  it.each([
    ["06:41", "6:41 am"],
    ["00:15", "12:15 am"],
    ["12:00", "12:00 pm"],
    ["19:02", "7:02 pm"],
  ])("reads %s as %s", (time, label) => {
    expect(timeOfDayLabel(time)).toBe(label);
  });
});

describe("captureMomentLabel", () => {
  it("says the day and the time together", () => {
    expect(captureMomentLabel({ date: "2026-09-14", time: "06:41" })).toBe(
      "14 September 2026, 6:41 am",
    );
  });
});

describe("dayMonthLabel", () => {
  it("drops the year, for the way back to a day", () => {
    expect(dayMonthLabel("2026-09-14")).toBe("14 September");
  });
});

describe("framePositionLabel", () => {
  it("counts the frame against the visible run", () => {
    expect(framePositionLabel({ position: 7, count: 45 })).toBe(
      "Frame 7 of 45",
    );
  });
});

describe("burstSpanLabel", () => {
  it.each([
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:44:00.000Z",
      "45 frames over 3 minutes",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:41:28.000Z",
      "45 frames over 28 seconds",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:41:00.400Z",
      "45 frames in a second",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:42:01.000Z",
      "45 frames over a minute",
    ],
  ])("from %s to %s reads %s", (startsAt, endsAt, label) => {
    expect(burstSpanLabel({ visibleFrameCount: 45, startsAt, endsAt })).toBe(
      label,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/labelHelpers/labelHelpers.test.ts`
Expected: FAIL, the six new names are not exported.

- [ ] **Step 3: Implement**

Add `import type { BurstSummary } from "@memory-shoebox/shared";` to the existing type import in `labelHelpers.ts` (it already imports `MilestoneRef` and `VisibilitySummary`), then append:

```ts
/** A capture's own day and clock time, as the camera would have shown them. */
export type WallClock = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, 24-hour. */
  time: string;
};

/**
 * The day and time a photograph was taken, on the clock where it was taken.
 *
 * The server's own rule (`items.md` § The capture date, step 2): the offset
 * the file carried when there is one, and the Shoebox's timezone when there
 * is not. Shifting by the offset and then reading in UTC is the same
 * arithmetic, done by `Intl` rather than by hand.
 *
 * @param options.capturedAt The UTC instant, as the contract carries it.
 * @param options.offsetMinutes `capturedAtOffsetMinutes`, or null.
 * @param options.timezone `settings.timezone`, for an offset-less capture.
 */
export function getWallClockFromCapture(options: {
  capturedAt: string;
  offsetMinutes: number | null;
  timezone: string;
}): WallClock {
  const { capturedAt, offsetMinutes, timezone } = options;
  const shifted = new Date(
    Date.parse(capturedAt) + (offsetMinutes ?? 0) * 60_000,
  );
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: offsetMinutes === null ? timezone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(shifted);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => {
    return (
      parts.find((part) => {
        return part.type === type;
      })?.value ?? "00"
    );
  };
  return {
    date: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    time: `${valueOf("hour")}:${valueOf("minute")}`,
  };
}

/** "6:41 am", from a 24-hour `HH:MM`, the way the prototypes print it. */
export function timeOfDayLabel(time: string): string {
  const [hourText = "0", minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${minuteText} ${hour < 12 ? "am" : "pm"}`;
}

/** "14 September 2026, 6:41 am". */
export function captureMomentLabel(wallClock: Readonly<WallClock>): string {
  return `${dayLabel(wallClock.date)}, ${timeOfDayLabel(wallClock.time)}`;
}

/** "14 September", for the way back to a day. */
export function dayMonthLabel(capturedOn: string): string {
  return dayjs(capturedOn).format("D MMMM");
}

/** "Frame 7 of 45". Both numbers are per viewer, from the server. */
export function framePositionLabel(options: {
  position: number;
  count: number;
}): string {
  return `Frame ${options.position} of ${options.count}`;
}

/**
 * "45 frames over 3 minutes": how long the run took, read off its visible
 * ends, which `BurstSummary` computes per viewer for exactly this reason.
 */
export function burstSpanLabel(
  burst: Readonly<
    Pick<BurstSummary, "visibleFrameCount" | "startsAt" | "endsAt">
  >,
): string {
  const seconds = Math.round(
    (Date.parse(burst.endsAt) - Date.parse(burst.startsAt)) / 1000,
  );
  const minutes = Math.round(seconds / 60);
  const span =
    seconds <= 1
      ? "in a second"
      : seconds < 60
        ? `over ${seconds} seconds`
        : minutes === 1
          ? "over a minute"
          : `over ${minutes} minutes`;
  return `${burst.visibleFrameCount} frames ${span}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/labelHelpers/labelHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/system/labelHelpers
git commit -m "feat(web): label helpers for a capture's own clock and a burst's span

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The item copy module

**Files:**

- Create: `apps/web/src/surfaces/Item/itemCopy/itemCopy.ts`
- Create: `apps/web/src/surfaces/Item/itemCopy/itemCopy.test.ts`

Decision 11 rewrites the prototype copy the payload cannot back. Everything kind-aware is here.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import {
  burstLeavingProse,
  captureSourceProse,
  commentSendFailure,
  commentsHeading,
  deleteItemProse,
  deleteReasonProse,
  describeProse,
  itemHeading,
  itemWriteFailure,
  kindNoun,
  removalAskProse,
  visibilityProse,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { makeComment } from "@/testing/itemFixtures";

/** A refusal the way `apiFetch` throws one. */
function _refusal(options: {
  status: number;
  code: string;
  retryAfterSeconds?: number;
}): ApiRequestError {
  return new ApiRequestError({
    status: options.status,
    code: options.code,
    message: "refused",
    details:
      options.retryAfterSeconds === undefined
        ? undefined
        : { retryAfterSeconds: options.retryAfterSeconds },
  });
}

describe("kindNoun and itemHeading", () => {
  it("names the kind", () => {
    expect(kindNoun("photo")).toBe("photograph");
    expect(kindNoun("video")).toBe("video");
  });

  it("gives the page a heading a screen reader can land on", () => {
    expect(itemHeading({ kind: "photo", capturedOn: "2026-09-14" })).toBe(
      "A photograph from 14 September 2026",
    );
  });
});

describe("commentsHeading", () => {
  it("says nothing has been said when nothing has", () => {
    expect(commentsHeading({ kind: "photo", comments: [] })).toBe(
      "Nothing said yet",
    );
  });

  it("counts one comment in the singular", () => {
    expect(commentsHeading({ kind: "photo", comments: [makeComment()] })).toBe(
      "1 comment",
    );
  });

  it("counts the pinned ones on a video, and only when there are some", () => {
    const comments = [
      makeComment(),
      makeComment({
        commentId: "018f0000-0000-7000-8000-00000000d102",
        atSeconds: 4,
      }),
    ];
    expect(commentsHeading({ kind: "video", comments })).toBe(
      "2 comments, 1 pinned to a moment",
    );
    expect(commentsHeading({ kind: "video", comments: [makeComment()] })).toBe(
      "1 comment",
    );
  });
});

describe("the failure sentences", () => {
  it("says a refused write is a change of rights, not a fault", () => {
    expect(
      itemWriteFailure(_refusal({ status: 403, code: "item_edit_forbidden" })),
    ).toBe(
      "You can no longer change this one. The page has caught up with what you may do.",
    );
  });

  it("says how long to wait when rate limited", () => {
    expect(
      itemWriteFailure(
        _refusal({ status: 429, code: "rate_limited", retryAfterSeconds: 12 }),
      ),
    ).toBe(
      "That did not go through: a lot has been sent from here just now. Wait 12 seconds and try again.",
    );
  });

  it("falls back to one plain sentence", () => {
    expect(itemWriteFailure(new Error("dropped"))).toBe(
      "That did not go through. Try again.",
    );
  });

  it("tells somebody their words are still there when a comment fails", () => {
    expect(commentSendFailure(new Error("dropped"))).toBe(
      "It did not send. It is still here, so try again.",
    );
    expect(
      commentSendFailure(
        _refusal({ status: 429, code: "rate_limited", retryAfterSeconds: 1 }),
      ),
    ).toBe(
      "It did not send: a lot has been said from here just now. Wait a second and send it again. It is still here.",
    );
  });
});

describe("the delete copy", () => {
  it("counts the comments that go with it", () => {
    expect(deleteItemProse({ commentCount: 3 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again, and the 3 comments on it go with it.",
    );
    expect(deleteItemProse({ commentCount: 1 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again, and the one comment on it goes with it.",
    );
    expect(deleteItemProse({ commentCount: 0 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again.",
    );
  });

  it("says why this viewer may delete it", () => {
    expect(deleteReasonProse({ isUploader: true })).toContain(
      "You uploaded this one",
    );
    expect(deleteReasonProse({ isUploader: false })).toContain(
      "You run the archive",
    );
  });
});

describe("the rest", () => {
  it("names who a removal request tells", () => {
    expect(removalAskProse("Mamá")).toBe(
      "You are tagged in this one. Asking tells Mamá, who put it up, and everyone who runs the archive.",
    );
  });

  it("does not tell 'everyone else' anything when it is everyone", () => {
    expect(visibilityProse({ kind: "photo", mode: "everyone" })).toBe(
      "Everybody in the Shoebox can open it.",
    );
    expect(visibilityProse({ kind: "video", mode: "only" })).toBe(
      "To everyone else this video is not there at all, and it is not counted in the day's total.",
    );
  });

  it("counts the frames a date move leaves behind", () => {
    expect(burstLeavingProse(45)).toMatch(
      /The other 44 stay where they are\.$/,
    );
    expect(burstLeavingProse(2)).toMatch(/The other one stays where it is\.$/);
  });

  it("says where the date came from, honestly", () => {
    expect(
      captureSourceProse({ kind: "photo", captureSource: "exif" }),
    ).toMatch(/^Read off the file itself\./);
    expect(
      captureSourceProse({ kind: "photo", captureSource: "uploader_set" }),
    ).toMatch(/^Put right by hand\./);
  });

  it("quotes the generated line only while there is one to quote", () => {
    expect(
      describeProse({ draft: "", generated: "Mateo, 14 September 2026" }),
    ).toContain("“Mateo, 14 September 2026”");
    expect(describeProse({ draft: "Papá in scrubs", generated: "x" })).toBe(
      "That is what gets read out. It replaces what we worked out on our own.",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemCopy/itemCopy.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `itemCopy.ts`**

```ts
import type {
  CommentDto,
  ItemDetail,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/client/client";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";

/**
 * Every sentence surfaces 3 and 4 say that depends on the item, in one file.
 *
 * A photograph and a video share one route and one set of sheets, and the
 * only difference most sentences carry is the noun. Keeping them together is
 * what stops "photograph" surviving on a video's delete button.
 */

/** Which of the two an item is. */
type ItemKind = ItemDetail["kind"];

/** "photograph" or "video": the noun every kind-aware sentence turns on. */
export function kindNoun(kind: ItemKind): string {
  return kind === "photo" ? "photograph" : "video";
}

/** The page's own heading, for a screen reader. Visually hidden. */
export function itemHeading(options: {
  kind: ItemKind;
  capturedOn: string;
}): string {
  return `A ${kindNoun(options.kind)} from ${dayLabel(options.capturedOn)}`;
}

/** The thread's heading: a count, and on a video how many are pinned. */
export function commentsHeading(options: {
  kind: ItemKind;
  comments: readonly CommentDto[];
}): string {
  const { kind, comments } = options;
  if (comments.length === 0) {
    return "Nothing said yet";
  }
  const said =
    comments.length === 1 ? "1 comment" : `${comments.length} comments`;
  const pinnedCount = comments.filter((comment) => {
    return comment.atSeconds !== null;
  }).length;
  return kind === "video" && pinnedCount > 0
    ? `${said}, ${pinnedCount} pinned to a moment`
    : said;
}

/** What an empty thread says. The composer under it is the surface. */
export function quietThreadProse(kind: ItemKind): string {
  return kind === "photo"
    ? "Nobody has written on this one yet. Anybody who can see it can be the first."
    : "Nobody has written on this one. Anything said here can stand at a moment in the video, or just at the bottom like an ordinary comment.";
}

/**
 * Under Send. Nothing in the payload counts an audience and the client cannot
 * expand a rule, so it names none (decision 11).
 */
export const COMPOSER_HINT = "Everyone who can see this one can read it.";

/** Under the reaction on the photograph or the video itself. */
export function reactionHint(kind: ItemKind): string {
  return kind === "photo"
    ? "A reaction is the whole of what most people will ever leave, and that is plenty. Nobody is emailed about one."
    : "One tap. For most of the people here it is the whole of what they will ever leave, and it is enough.";
}

/** Seconds in words, rounded up and never below one. */
function _seconds(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return seconds === 1 ? "a second" : `${seconds} seconds`;
}

/** How long a rate-limited caller must wait, in words. */
function _wait(error: ApiRequestError): string {
  return error.details?.retryAfterSeconds === undefined
    ? "a minute"
    : _seconds(error.details.retryAfterSeconds);
}

/**
 * A write on this page that did not land.
 *
 * A `403` is the server saying the viewer's rights changed underneath the
 * page, and the page refetches once to catch up (decision 12), so the
 * sentence says it has.
 */
export function itemWriteFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "You can no longer change this one. The page has caught up with what you may do.";
  }
  if (error instanceof ApiRequestError && error.code === "rate_limited") {
    return `That did not go through: a lot has been sent from here just now. Wait ${_wait(error)} and try again.`;
  }
  return "That did not go through. Try again.";
}

/** A comment that did not send. Its words are still in the field. */
export function commentSendFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "rate_limited") {
    return `It did not send: a lot has been said from here just now. Wait ${_wait(error)} and send it again. It is still here.`;
  }
  return "It did not send. It is still here, so try again.";
}

/** A reaction that did not land, which the control has already put back. */
export const REACTION_FAILURE =
  "That reaction did not go through, so it has been put back. Try again.";

/** The delete dialog: what is destroyed, and what goes with it. */
export function deleteItemProse(options: { commentCount: number }): string {
  const { commentCount } = options;
  const comments =
    commentCount === 0
      ? ""
      : commentCount === 1
        ? ", and the one comment on it goes with it"
        : `, and the ${commentCount} comments on it go with it`;
  return `It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again${comments}.`;
}

/** Under the delete button: why this viewer may. */
export function deleteReasonProse(options: { isUploader: boolean }): string {
  return options.isUploader
    ? "You uploaded this one, so you can take it down. Deleting removes the file as well as the record."
    : "You run the archive, so you can take it down. Deleting removes the file as well as the record.";
}

/** Under "Ask for this to come down": who is told. */
export function removalAskProse(uploaderName: string): string {
  return `You are tagged in this one. Asking tells ${uploaderName}, who put it up, and everyone who runs the archive.`;
}

/** Under the visibility sentence. "Everyone else" means nothing for everyone. */
export function visibilityProse(options: {
  kind: ItemKind;
  mode: VisibilitySummary["mode"];
}): string {
  return options.mode === "everyone"
    ? "Everybody in the Shoebox can open it."
    : `To everyone else this ${kindNoun(options.kind)} is not there at all, and it is not counted in the day's total.`;
}

/** Under the people and tags. */
export function peopleTagProse(kind: ItemKind): string {
  return `A tag on a person says who is in the ${kindNoun(kind)}. It never says who may open it.`;
}

/** Where the capture date came from, which is not always the file. */
const SOURCE_SENTENCE: Record<ItemDetail["captureSource"], string> = {
  exif: "Read off the file itself.",
  video_metadata: "Read off the file itself.",
  filename: "Read off the file's name.",
  file_mtime:
    "Taken from when the file was last saved, because it carried no date of its own.",
  uploader_set: "Put right by hand.",
  upload_time: "The file said nothing, so this is when it was uploaded.",
};

/** Under the capture date: where it came from, and why it matters. */
export function captureSourceProse(options: {
  kind: ItemKind;
  captureSource: ItemDetail["captureSource"];
}): string {
  const noun = kindNoun(options.kind);
  return `${SOURCE_SENTENCE[options.captureSource]} Cameras with a flat battery and scans of old prints get this wrong, and a ${noun} on the wrong day is a ${noun} nobody finds again.`;
}

/** What leaving a burst costs, for the date warning. */
export function burstLeavingProse(visibleFrameCount: number): string {
  const otherCount = visibleFrameCount - 1;
  const others =
    otherCount === 1
      ? "The other one stays where it is."
      : `The other ${otherCount} stay where they are.`;
  return `A burst is a run of frames from one moment, so a frame on another day is not part of it any more. ${others}`;
}

/**
 * Under the description field.
 *
 * `generated` is `media.altText` while no override exists, which is then the
 * composed line; once an override exists the client no longer holds the
 * composed line, so the sentence describes it rather than quoting it.
 */
export function describeProse(options: {
  draft: string;
  generated: string | undefined;
}): string {
  if (options.draft.trim().length > 0) {
    return "That is what gets read out. It replaces what we worked out on our own.";
  }
  return options.generated === undefined
    ? "Left empty, this one reads as a line built from who is tagged in it and when it was taken."
    : `Left empty, this one reads as “${options.generated}”, built from who is tagged in it and when it was taken. That is honest and it is usually enough, which is the point: nobody is going to describe a whole upload by hand.`;
}

/** The "not here" state, identical for a deleted and an invisible item. */
export const NOT_HERE_HEADING = "This one is not here.";

/** Under it. The same words for both causes, because the 404 is the same. */
export const NOT_HERE_PROSE =
  "It may have been taken down, or it was never shared with you. Either way there is nothing at this address for you to open.";
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemCopy/itemCopy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/surfaces/Item/itemCopy
git commit -m "feat(web): the item viewer's copy, kind-aware and in one place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase B: the API modules

Every module follows `api/me/me.ts`: plain functions and `queryOptions`, never hooks, and every response parsed with a schema. A shared helper for the tests in this phase is declared once per test file (they are short).

### Task 5: `api/items`

**Files:**

- Create: `apps/web/src/api/items/items.ts`
- Create: `apps/web/src/api/items/items.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteItem,
  itemQueryOptions,
  makeOriginalHrefFromItemId,
  setItemAltText,
  setItemCaptureDate,
  setItemPeople,
  setItemTags,
  setItemVisibility,
} from "@/api/items/items";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtures";

/** One request as the server saw it. */
type Call = { url: string; method: string; body: unknown };

const calls: Call[] = [];

/** Answers every request with one body, and records what was asked. */
function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Calls a query function with no context, which this one never reads. */
function _callQueryFn(options: ReturnType<typeof itemQueryOptions>) {
  const queryFn = options.queryFn as NonNullable<typeof options.queryFn>;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("itemQueryOptions", () => {
  it("asks for the permalink and parses it", async () => {
    _answerWith(makeItemDetail());

    await expect(
      _callQueryFn(itemQueryOptions(ITEM_ID)),
    ).resolves.toMatchObject({ itemId: ITEM_ID });
    expect(calls).toEqual([
      { url: `/api/items/${ITEM_ID}`, method: "GET", body: undefined },
    ]);
  });
});

describe("the item's writes", () => {
  it.each([
    [
      "the description",
      () => setItemAltText({ itemId: ITEM_ID, body: { altText: "Papá" } }),
      "PATCH",
      `/api/items/${ITEM_ID}`,
      { altText: "Papá" },
    ],
    [
      "the tags",
      () => setItemTags({ itemId: ITEM_ID, body: { tags: ["beach"] } }),
      "PUT",
      `/api/items/${ITEM_ID}/tags`,
      { tags: ["beach"] },
    ],
    [
      "the people",
      () =>
        setItemPeople({
          itemId: ITEM_ID,
          body: { people: [{ displayName: "Sofía" }] },
        }),
      "PUT",
      `/api/items/${ITEM_ID}/people`,
      { people: [{ displayName: "Sofía" }] },
    ],
    [
      "the visibility",
      () =>
        setItemVisibility({
          itemId: ITEM_ID,
          body: { visibilityRuleId: "visibility-rule-everyone" },
        }),
      "PATCH",
      `/api/items/${ITEM_ID}/visibility`,
      { visibilityRuleId: "visibility-rule-everyone" },
    ],
    [
      "the capture date",
      () =>
        setItemCaptureDate({
          itemId: ITEM_ID,
          body: { capturedOn: "2026-09-15" },
        }),
      "POST",
      `/api/items/${ITEM_ID}/capture-date`,
      { capturedOn: "2026-09-15" },
    ],
  ])(
    "sends %s and answers with the whole item",
    async (_name, write, method, url, body) => {
      _answerWith(makeItemDetail());

      await expect(write()).resolves.toMatchObject({ itemId: ITEM_ID });
      expect(calls).toEqual([{ url, method, body }]);
    },
  );

  it("deletes with no body and reads the 204", async () => {
    _answerWith(undefined, 204);

    await expect(deleteItem(ITEM_ID)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { url: `/api/items/${ITEM_ID}`, method: "DELETE", body: undefined },
    ]);
  });

  it("points the download at the route that signs it", () => {
    expect(makeOriginalHrefFromItemId(ITEM_ID)).toBe(
      `/api/items/${ITEM_ID}/original`,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/items/items.test.ts`
Expected: FAIL, `@/api/items/items` does not exist.

- [ ] **Step 3: Implement `items.ts`**

```ts
import {
  itemDetailSchema,
  type ItemDetail,
  type SetCaptureDateRequest,
  type SetItemPeopleRequest,
  type SetItemTagsRequest,
  type SetItemVisibilityRequest,
  type UpdateItemRequest,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";

/** Every item's query key starts here, so one prefix reaches all of them. */
export const ITEMS_QUERY_KEY = ["items"] as const;

/** The exact path one item lives at, below `/api`. */
export function makeItemPathFromItemId(itemId: string): string {
  return `/items/${encodeURIComponent(itemId)}`;
}

/**
 * Where "Download the original" points.
 *
 * A route that redirects to a freshly signed URL rather than a field on
 * `MediaRef` (`items.md` Ruling 9), so the href is built here and the route
 * puts a sensible filename into the download itself.
 */
export function makeOriginalHrefFromItemId(itemId: string): string {
  return `/api${makeItemPathFromItemId(itemId)}/original`;
}

/**
 * The permalink.
 *
 * **Every run of this query counts an open** (`items.md` transformation 9),
 * and surface 17 prints the count. So it refetches on mount, because arriving
 * at a photograph again is opening it again, and never on focus or reconnect,
 * because neither is. Every write answers with what it changed and is put
 * into this entry directly (`surfaces/Item/itemWrites/`), never by
 * invalidating it, which would be one phantom open per tap.
 */
export function itemQueryOptions(
  itemId: string,
): ReturnType<typeof queryOptions<ItemDetail, Error, ItemDetail, string[]>> {
  return queryOptions({
    queryKey: [...ITEMS_QUERY_KEY, itemId],
    queryFn: (): Promise<ItemDetail> => {
      return apiFetch({
        path: makeItemPathFromItemId(itemId),
        schema: itemDetailSchema,
      });
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** One write that answers with the whole item, as five of them do. */
function _writeItemDetail(options: {
  path: string;
  method: "PATCH" | "PUT" | "POST";
  body: unknown;
}): Promise<ItemDetail> {
  return apiFetch({
    path: options.path,
    schema: itemDetailSchema,
    init: jsonInit({ method: options.method, body: options.body }),
  });
}

/** The alt text override, and nothing else (`PATCH /api/items/:itemId`). */
export function setItemAltText(options: {
  itemId: string;
  body: UpdateItemRequest;
}): Promise<ItemDetail> {
  return _writeItemDetail({
    path: makeItemPathFromItemId(options.itemId),
    method: "PATCH",
    body: options.body,
  });
}

/** Replaces the whole tag set. Names, not ids: the field can invent one. */
export function setItemTags(options: {
  itemId: string;
  body: SetItemTagsRequest;
}): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/tags`,
    method: "PUT",
    body: options.body,
  });
}

/** Replaces the whole people set: known people by id, new ones by name. */
export function setItemPeople(options: {
  itemId: string;
  body: SetItemPeopleRequest;
}): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/people`,
    method: "PUT",
    body: options.body,
  });
}

/** Repoints the item at a rule `findOrCreateVisibilityRule` returned. */
export function setItemVisibility(options: {
  itemId: string;
  body: SetItemVisibilityRequest;
}): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/visibility`,
    method: "PATCH",
    body: options.body,
  });
}

/** The hand correction to the capture date, which keeps the clock time. */
export function setItemCaptureDate(options: {
  itemId: string;
  body: SetCaptureDateRequest;
}): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/capture-date`,
    method: "POST",
    body: options.body,
  });
}

/** Destroys the record and the file. Answers `204`. */
export function deleteItem(itemId: string): Promise<void> {
  return apiFetch({
    path: makeItemPathFromItemId(itemId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/items/items.test.ts && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, and the type-check clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/items
git commit -m "feat(web): the item's query and its writes, against step 5a

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: `api/comments`, `api/reactions`, `api/visibilityRules`

**Files:**

- Create: `apps/web/src/api/comments/comments.ts`, `apps/web/src/api/comments/comments.test.ts`
- Create: `apps/web/src/api/reactions/reactions.ts`, `apps/web/src/api/reactions/reactions.test.ts`
- Create: `apps/web/src/api/visibilityRules/visibilityRules.ts`, `apps/web/src/api/visibilityRules/visibilityRules.test.ts`

- [ ] **Step 1: Write the three failing tests**

`comments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/api/comments/comments";
import { ITEM_ID, makeComment } from "@/testing/itemFixtures";

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];

function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMENT = makeComment();

describe("the comment routes", () => {
  it("says something on an item, pinned or not", async () => {
    _answerWith(COMMENT, 201);

    await expect(
      createComment({
        itemId: ITEM_ID,
        body: { body: "Hello", atSeconds: 4.25 },
      }),
    ).resolves.toEqual(COMMENT);
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/comments`,
        method: "POST",
        body: { body: "Hello", atSeconds: 4.25 },
      },
    ]);
  });

  it("edits the body and nothing else", async () => {
    _answerWith(COMMENT);

    await updateComment({ commentId: COMMENT.commentId, body: { body: "Hi" } });
    expect(calls).toEqual([
      {
        url: `/api/comments/${COMMENT.commentId}`,
        method: "PATCH",
        body: { body: "Hi" },
      },
    ]);
  });

  it("deletes one and reads the 204", async () => {
    _answerWith(undefined, 204);

    await expect(deleteComment(COMMENT.commentId)).resolves.toBeUndefined();
    expect(calls[0]?.method).toBe("DELETE");
  });
});
```

`reactions.test.ts` (same `Call`, `calls`, `_answerWith` and `afterEach` block as above, copied in full):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCommentReaction,
  clearItemReaction,
  setCommentReaction,
  setItemReaction,
} from "@/api/reactions/reactions";
import { ITEM_ID } from "@/testing/itemFixtures";

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];

function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMENT_ID = "018f0000-0000-7000-8000-00000000d101";
const SUMMARY = { kinds: [], myKind: null };

describe("the reaction routes", () => {
  it("sets one on an item and answers with the whole summary", async () => {
    _answerWith(SUMMARY);

    await expect(
      setItemReaction({ itemId: ITEM_ID, kind: "love" }),
    ).resolves.toEqual(SUMMARY);
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "PUT",
        body: { kind: "love" },
      },
    ]);
  });

  it("takes one off an item with a bare DELETE", async () => {
    _answerWith(undefined, 204);

    await expect(clearItemReaction(ITEM_ID)).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  it("does the same two on a comment", async () => {
    _answerWith(SUMMARY);
    await setCommentReaction({ commentId: COMMENT_ID, kind: "care" });
    expect(calls[0]).toEqual({
      url: `/api/comments/${COMMENT_ID}/reaction`,
      method: "PUT",
      body: { kind: "care" },
    });

    _answerWith(undefined, 204);
    await clearCommentReaction(COMMENT_ID);
    expect(calls[0]?.method).toBe("DELETE");
  });
});
```

`visibilityRules.test.ts` (same helper block):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];

function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findOrCreateVisibilityRule", () => {
  it("posts the mode and the subjects and reads the rule back", async () => {
    const answer = {
      visibilityRuleId: "018f0000-0000-7000-8000-0000000a0001",
      visibility: {
        visibilityRuleId: "018f0000-0000-7000-8000-0000000a0001",
        mode: "only",
        label: "Just us two",
        subjects: [
          {
            kind: "member",
            id: "018f0000-0000-7000-8000-000000000000",
            displayName: "Papá",
          },
        ],
      },
    };
    _answerWith(answer);

    await expect(
      findOrCreateVisibilityRule({
        mode: "only",
        subjects: [
          { kind: "member", id: "018f0000-0000-7000-8000-000000000000" },
        ],
      }),
    ).resolves.toEqual(answer);
    expect(calls[0]).toMatchObject({
      url: "/api/visibility-rules/resolve",
      method: "POST",
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/comments src/api/reactions src/api/visibilityRules`
Expected: FAIL, the three modules do not exist.

- [ ] **Step 3: Implement `comments.ts`**

```ts
import {
  commentDtoSchema,
  type CommentDto,
  type CreateCommentRequest,
  type UpdateCommentRequest,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";
import { makeItemPathFromItemId } from "@/api/items/items";

/** The exact path one comment lives at, below `/api`. */
function _commentPath(commentId: string): string {
  return `/comments/${encodeURIComponent(commentId)}`;
}

/**
 * Says something on an item, optionally pinned to a moment in a video.
 *
 * `atSeconds` goes as the float the scrubber produced: rounding it would move
 * the mark (`items.md` § `POST /api/items/:itemId/comments`).
 */
export function createComment(options: {
  itemId: string;
  body: CreateCommentRequest;
}): Promise<CommentDto> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/comments`,
    schema: commentDtoSchema,
    init: jsonInit({ method: "POST", body: options.body }),
  });
}

/** Edits the body. A pin cannot move, so the body is all there is. */
export function updateComment(options: {
  commentId: string;
  body: UpdateCommentRequest;
}): Promise<CommentDto> {
  return apiFetch({
    path: _commentPath(options.commentId),
    schema: commentDtoSchema,
    init: jsonInit({ method: "PATCH", body: options.body }),
  });
}

/** Takes a comment down, with its reactions. Answers `204`. */
export function deleteComment(commentId: string): Promise<void> {
  return apiFetch({
    path: _commentPath(commentId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
```

- [ ] **Step 4: Implement `reactions.ts`**

```ts
import {
  reactionSummarySchema,
  type ReactionKind,
  type ReactionSummary,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";
import { makeItemPathFromItemId } from "@/api/items/items";

/**
 * The four reaction routes. Setting answers with the whole summary, because
 * that is what the row draws; taking one off answers `204`, and the caller
 * removes its own row from the summary it holds (`items.md` § Reactions).
 */

/** Where a comment's reaction lives. */
function _commentReactionPath(commentId: string): string {
  return `/comments/${encodeURIComponent(commentId)}/reaction`;
}

/** Sets or changes mine on an item. */
export function setItemReaction(options: {
  itemId: string;
  kind: ReactionKind;
}): Promise<ReactionSummary> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/reaction`,
    schema: reactionSummarySchema,
    init: jsonInit({ method: "PUT", body: { kind: options.kind } }),
  });
}

/** Takes mine off an item. */
export function clearItemReaction(itemId: string): Promise<void> {
  return apiFetch({
    path: `${makeItemPathFromItemId(itemId)}/reaction`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}

/** Sets or changes mine on a comment. */
export function setCommentReaction(options: {
  commentId: string;
  kind: ReactionKind;
}): Promise<ReactionSummary> {
  return apiFetch({
    path: _commentReactionPath(options.commentId),
    schema: reactionSummarySchema,
    init: jsonInit({ method: "PUT", body: { kind: options.kind } }),
  });
}

/** Takes mine off a comment. */
export function clearCommentReaction(commentId: string): Promise<void> {
  return apiFetch({
    path: _commentReactionPath(commentId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
```

- [ ] **Step 5: Implement `visibilityRules.ts`**

```ts
import {
  resolveVisibilityRuleResponseSchema,
  type ResolveVisibilityRuleRequest,
  type ResolveVisibilityRuleResponse,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/client/client";

/**
 * `POST /api/visibility-rules/resolve`: a mode and subjects to a rule id.
 *
 * Named for what it does rather than for the route's verb. Rules are shared
 * and immutable from the edit path, so changing who sees an item is two
 * calls: this one, then `setItemVisibility` with the id it returns
 * (`items.md` § Visibility).
 */
export function findOrCreateVisibilityRule(
  body: Readonly<ResolveVisibilityRuleRequest>,
): Promise<ResolveVisibilityRuleResponse> {
  return apiFetch({
    path: "/visibility-rules/resolve",
    schema: resolveVisibilityRuleResponseSchema,
    init: jsonInit({ method: "POST", body }),
  });
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/comments src/api/reactions src/api/visibilityRules && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, type-check clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api/comments apps/web/src/api/reactions apps/web/src/api/visibilityRules
git commit -m "feat(web): comments, reactions and the rule lookup, against step 5a

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `api/members` and `api/groups`, against step 8a's contract

**Files:**

- Create: `apps/web/src/api/members/members.ts`, `apps/web/src/api/members/members.test.ts`
- Create: `apps/web/src/api/groups/groups.ts`, `apps/web/src/api/groups/groups.test.ts`

Decision 8: written now against `administration.md` § `GET /api/members` and § `GET /api/groups`, both of which have two shapes. The schemas are local and narrow: Zod's `z.object` strips every field not named, so an admin's row with its email, sessions and invitation parses down to what the picker reads.

- [ ] **Step 1: Write the failing tests**

`members.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { membersQueryOptions } from "@/api/members/members";

function _answerWith(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function _callQueryFn() {
  const options = membersQueryOptions();
  const queryFn = options.queryFn as NonNullable<typeof options.queryFn>;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAPA = {
  memberId: "018f0000-0000-7000-8000-000000000000",
  displayName: "Papá",
};

describe("membersQueryOptions", () => {
  it("reads the directory shape an uploader gets", async () => {
    _answerWith({ shape: "directory", members: [PAPA], nextCursor: null });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "directory",
      members: [PAPA],
      nextCursor: null,
    });
  });

  it("reads an admin's rows down to what the picker needs", async () => {
    _answerWith({
      shape: "admin",
      members: [
        {
          ...PAPA,
          email: "papa@example.com",
          role: "admin",
          status: "active",
          sessions: [],
          invitation: null,
        },
      ],
      nextCursor: null,
      activeAdminCount: 1,
    });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "admin",
      members: [{ ...PAPA, role: "admin" }],
      nextCursor: null,
    });
  });
});
```

`groups.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupsQueryOptions } from "@/api/groups/groups";

function _answerWith(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function _callQueryFn() {
  const options = groupsQueryOptions();
  const queryFn = options.queryFn as NonNullable<typeof options.queryFn>;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const GRANDPARENTS = {
  groupId: "018f0000-0000-7000-8000-0000000a0001",
  name: "The grandparents",
};

describe("groupsQueryOptions", () => {
  it("reads the picker shape an uploader gets", async () => {
    _answerWith({ shape: "picker", groups: [GRANDPARENTS], nextCursor: null });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "picker",
      groups: [GRANDPARENTS],
      nextCursor: null,
    });
  });

  it("keeps an admin's member list, which is how many people a group holds", async () => {
    _answerWith({
      shape: "admin",
      groups: [
        {
          ...GRANDPARENTS,
          createdAt: "2026-09-01T10:00:00.000Z",
          members: [
            {
              memberId: "018f0000-0000-7000-8000-000000000000",
              displayName: "Papá",
            },
          ],
          usedByOnlyRules: 9,
          usedByExceptRules: 0,
        },
      ],
      nextCursor: null,
    });

    const answer = await _callQueryFn();
    expect(answer.shape).toBe("admin");
    expect(answer.groups[0]).not.toHaveProperty("usedByOnlyRules");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/members src/api/groups`
Expected: FAIL, the modules do not exist.

- [ ] **Step 3: Implement `members.ts`**

```ts
import { memberRefSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/client/client";
import { MEMBER_ROLES } from "@/system/memberRole";

/**
 * `GET /api/members`, the source of names for the visibility picker.
 *
 * **Step 8a builds this route and has not merged.** The client is written now
 * against `administration.md` § `GET /api/members`, exactly as step 5b wrote
 * the burst fan against step 5a's contract, so the picker works the day 8a
 * lands (decision 8 of the step 6b design). Until then the route answers
 * `404` and the picker offers what the item already names.
 *
 * The schema is local rather than in `@memory-shoebox/shared`, because 8a owns
 * the shared one and will replace this. It names only what the picker reads;
 * `z.object` strips the rest of an admin's row, address and devices included.
 */
export const membersResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    members: z.array(memberRefSchema.extend({ role: z.enum(MEMBER_ROLES) })),
    nextCursor: z.null(),
  }),
  z.object({
    shape: z.literal("directory"),
    members: z.array(memberRefSchema),
    nextCursor: z.null(),
  }),
]);

/** The member list in either of its two shapes. */
export type MembersResponse = z.infer<typeof membersResponseSchema>;

/** Every member, for the picker. Tens of rows; it changes rarely. */
export function membersQueryOptions(): ReturnType<
  typeof queryOptions<MembersResponse, Error, MembersResponse, string[]>
> {
  return queryOptions({
    queryKey: ["members"],
    queryFn: (): Promise<MembersResponse> => {
      return apiFetch({ path: "/members", schema: membersResponseSchema });
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Implement `groups.ts`**

```ts
import { idSchema, memberRefSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/client/client";

/**
 * `GET /api/groups`, the group half of the visibility picker.
 *
 * **Step 8a's route, written against `administration.md` before it merges**,
 * for the reason `api/members/members.ts` gives. The usage counts on an
 * admin's row are deliberately not read: they count items, and the picker has
 * no use for them.
 */
export const groupsResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    groups: z.array(
      z.object({
        groupId: idSchema,
        name: z.string(),
        members: z.array(memberRefSchema),
      }),
    ),
    nextCursor: z.null(),
  }),
  z.object({
    shape: z.literal("picker"),
    groups: z.array(z.object({ groupId: idSchema, name: z.string() })),
    nextCursor: z.null(),
  }),
]);

/** The group list in either of its two shapes. */
export type GroupsResponse = z.infer<typeof groupsResponseSchema>;

/** Every group, for the picker. */
export function groupsQueryOptions(): ReturnType<
  typeof queryOptions<GroupsResponse, Error, GroupsResponse, string[]>
> {
  return queryOptions({
    queryKey: ["groups"],
    queryFn: (): Promise<GroupsResponse> => {
      return apiFetch({ path: "/groups", schema: groupsResponseSchema });
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/members src/api/groups && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, type-check clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/members apps/web/src/api/groups
git commit -m "feat(web): the member and group lists, written against step 8a's contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase C: the system components

### Task 8: `PeopleField` takes a member with no role and a group with no count

**Files:**

- Modify: `apps/web/src/system/PeopleField/PeopleField.tsx`
- Modify: `apps/web/src/system/PeopleField/PeopleField.test.tsx`

The uploader shapes of `GET /api/members` and `GET /api/groups` carry neither, and neither does a subject the picker only knows from the item's own rule.

- [ ] **Step 1: Write the failing test**

Add to `PeopleField.test.tsx`:

```tsx
it("prints nothing beside a member or a group it was told nothing about", async () => {
  _render(
    <PeopleField
      label="Who"
      mode="members-and-groups"
      value={[]}
      onChange={() => {}}
      members={[{ memberId: "m3", displayName: "Tía Marisol" }]}
      groups={[{ groupId: "g2", name: "Cousins" }]}
      defaultDropdownOpened
    />,
  );

  expect(
    await screen.findByRole("option", { name: "Tía Marisol" }),
  ).toBeVisible();
  expect(screen.getByRole("option", { name: "Cousins" })).toBeVisible();
});
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run: `pnpm --filter @memory-shoebox/web type-check`
Expected: FAIL, `Property 'role' is missing` and `Property 'memberCount' is missing`.

- [ ] **Step 3: Make both optional**

In `PeopleField.tsx`:

```ts
/** A member who can be chosen, with the role the option line shows if known. */
export type PeopleFieldMember = MemberRef & {
  readonly role?: MemberRole;
};

/**
 * A group, with the size its option line shows when the caller knows it.
 * Only an admin's group list carries the members to count.
 */
export type PeopleFieldGroup = {
  readonly groupId: string;
  readonly name: string;
  readonly memberCount?: number;
};
```

and in `_optionDetail`:

```ts
if (group) {
  return group.memberCount === undefined ? "" : `${group.memberCount} people`;
}
const member = members.find((candidate) => {
  return candidate.memberId === value;
});
return member?.role === undefined ? "" : ROLE_WORD[member.role];
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/PeopleField && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/system/PeopleField
git commit -m "feat(web): the people field takes a member with no role and a group with no count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `TopBar`'s back link carries a search and a handler, and `ChipLink`

**Files:**

- Modify: `apps/web/src/system/Chrome/TopBar.tsx`
- Create: `apps/web/src/system/Chip/ChipLink.tsx`

Both are pass-throughs to `Link`, exercised by the item surface's tests in Task 17 (the back link's `href`) and Task 21 (the chips' `href`s). No red step of their own: a test here would only restate the props.

- [ ] **Step 1: Widen `TopBar`'s `back`**

```ts
import { Link, type LinkProps } from "@tanstack/react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import type { MouseEvent, ReactNode } from "react";
```

and in `Props`:

```ts
  back?: {
    readonly label: string;
    readonly to: LinkProps["to"];
    /** Whatever `to` needs, for a destination that carries a parameter. */
    readonly params?: LinkProps["params"];
    /** The destination's search, for a way back to one day of the pile. */
    readonly search?: LinkProps["search"];
    /**
     * Runs before the link navigates. Calling `preventDefault` stops it, which
     * is how the item page goes back through history instead when there is
     * history to go back through.
     */
    readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
```

and the link:

```tsx
        <Link
          to={back.to}
          params={back.params}
          search={back.search}
          onClick={back.onClick}
          className={classes.backlink}
        >
```

- [ ] **Step 2: Write `ChipLink.tsx`**

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  to: LinkProps["to"];
  search?: LinkProps["search"];
};

/**
 * A tag or a person that goes somewhere when pressed: the pile, filtered by
 * it.
 *
 * Drawn exactly as a `Chip`, because it is the same label, but a link rather
 * than a button. A chip with nothing to do would be a focusable button that
 * does nothing, and a person in this product is a filter rather than a
 * profile (`PRODUCT.md` § The archive), so pressing one opens the pile of
 * their photographs.
 */
export function ChipLink({ children, to, search }: Readonly<Props>): ReactNode {
  return (
    <Link to={to} search={search} className={classes.chip}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @memory-shoebox/web type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/system/Chrome/TopBar.tsx apps/web/src/system/Chip/ChipLink.tsx
git commit -m "feat(web): a back link that can carry a day, and a chip that is a link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: `Reactions` takes the server's answer, and the picker holds focus

**Files:**

- Modify: `apps/web/src/system/Reactions/presentReactions.ts`
- Modify: `apps/web/src/system/Reactions/Reactions.tsx`
- Modify: `apps/web/src/system/Reactions/Reactions.test.tsx`

Two defects in the ported control, both of which this step exposes. Its local `chosen` is seeded from the first summary and never re-read, so a server answer (or a rollback after a failure) cannot reach it. And the picker is portalled to the end of `<body>`, so a keyboard user who presses "React" tabs straight past the six choices.

- [ ] **Step 1: Write the failing tests**

Add to `Reactions.test.tsx` (import `makeSummaryFromChoice` from `@/system/Reactions/presentReactions`):

```tsx
  it("takes the server's answer when it arrives", () => {
    const { rerender } = _render(SUMMARY);

    rerender(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <Reactions
          reactions={{
            kinds: [...SUMMARY.kinds, { kind: "care", count: 1, members: [VIEWER] }],
            myKind: "care",
          }}
          viewer={VIEWER}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: /Care/ })).toBeVisible();
  });
});

describe("makeSummaryFromChoice", () => {
  it("adds my reaction as a kind of its own when nobody had left it", () => {
    expect(
      makeSummaryFromChoice({ reactions: SUMMARY, chosen: "wow", viewer: VIEWER }),
    ).toEqual({
      kinds: [...SUMMARY.kinds, { kind: "wow", count: 1, members: [VIEWER] }],
      myKind: "wow",
    });
  });

  it("drops a kind that taking mine off leaves at nought", () => {
    const mine = {
      kinds: [{ kind: "sad" as const, count: 1, members: [VIEWER] }],
      myKind: "sad" as const,
    };
    expect(
      makeSummaryFromChoice({ reactions: mine, chosen: null, viewer: VIEWER }),
    ).toEqual({ kinds: [], myKind: null });
  });
```

(The first `it` goes inside the existing `describe("Reactions", ...)`, so the closing `});` above ends that describe; the second `describe` follows it.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/Reactions`
Expected: FAIL, "takes the server's answer" finds "React" rather than "Care", and `makeSummaryFromChoice` is not exported.

- [ ] **Step 3: Add `makeSummaryFromChoice`**

Append to `presentReactions.ts`:

```ts
/**
 * The whole summary once a local choice is applied, in the shape the server
 * answers with.
 *
 * What the item's cache holds between a tap and the server's answer
 * (`surfaces/Item/itemWrites/useConversation.ts`), so the row reads the same
 * before and after the round trip and a failure can be rolled back to the
 * summary it replaced.
 */
export function makeSummaryFromChoice(options: {
  readonly reactions: ReactionSummary;
  readonly chosen: ReactionKind | null;
  readonly viewer: MemberRef;
}): ReactionSummary {
  return {
    kinds: [...makePresentReactionsFromSummary(options).entries],
    myKind: options.chosen,
  };
}
```

- [ ] **Step 4: Take the server's answer, and hold focus in the picker**

In `Reactions.tsx`, replace the line `const [chosen, setChosen] = useState<ReactionKind | null>(reactions.myKind);` with:

```ts
const [chosen, setChosen] = useState<ReactionKind | null>(reactions.myKind);
// The server's answer wins over the tap whenever it changes, which is also
// how a failed reaction is put back: the cache rolls back, `myKind` moves,
// and the row follows. Adjusted during render rather than in an effect,
// which is React's own pattern for state that tracks a prop.
const [answeredKind, setAnsweredKind] = useState(reactions.myKind);
if (reactions.myKind !== answeredKind) {
  setAnsweredKind(reactions.myKind);
  setChosen(reactions.myKind);
}
```

and give the picker's `Popover` (the first one, `opened={isPicking}`) two props:

```tsx
        <Popover
          opened={isPicking}
          onChange={setIsPicking}
          position="top-start"
          withinPortal
          trapFocus
          returnFocus
        >
```

`trapFocus` moves focus into the six choices when the picker opens, which is the only way a keyboard reaches a portalled dropdown, and `returnFocus` puts it back on "React" when it closes. jsdom cannot measure what is tabbable, so the keyboard path is asserted end to end in Task 30 rather than here.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/Reactions`
Expected: PASS, the five existing cases included.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/system/Reactions
git commit -m "fix(web): reactions take the server's answer, and the picker holds focus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: The composer and a comment really send

**Files:**

- Modify: `apps/web/src/system/Talk/Composer.tsx`
- Modify: `apps/web/src/system/Talk/CommentRow.tsx`
- Create: `apps/web/src/system/Talk/CommentWhen.tsx`
- Create: `apps/web/src/system/Talk/CommentEditor.tsx`
- Create: `apps/web/src/system/Talk/CommentOwnActions.tsx`
- Modify: `apps/web/src/system/Talk/Talk.test.tsx`

The composer fakes a send on a timer, and `CommentRow`'s Save and Delete close their forms without telling anybody. Both now take callbacks. The callback receives a second argument to call once the server has the words, which is what keeps the text on a failure: the field clears only on success.

- [ ] **Step 1: Write the failing tests**

In `Talk.test.tsx`, change the existing Send test's render to `_render(<Composer goesTo="This goes to everybody who can see it." onSend={() => {}} />);` and add:

```tsx
it("sends the words, and clears them only once they have arrived", async () => {
  const onSend = vi.fn();
  _render(<Composer goesTo="x" onSend={onSend} />);

  const field = screen.getByRole("textbox", { name: "Say something" });
  await userEvent.type(field, "He has his mother's chin.");
  await userEvent.click(screen.getByRole("button", { name: /Send/ }));

  expect(onSend).toHaveBeenCalledWith(
    "He has his mother's chin.",
    expect.any(Function),
  );
  expect(field).toHaveValue("He has his mother's chin.");

  act(() => {
    onSend.mock.calls[0]?.[1]();
  });
  expect(field).toHaveValue("");
});

it("keeps the words and says why when the send failed", async () => {
  _render(
    <Composer
      goesTo="x"
      onSend={() => {}}
      error="It did not send. It is still here, so try again."
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("It did not send.");
});

it("says where a pinned comment will stand", () => {
  _render(
    <Composer
      goesTo="x"
      onSend={() => {}}
      pinnedAt={4}
      onClearPin={() => {}}
    />,
  );

  expect(
    screen.getByRole("textbox", { name: "Say something at 0:04" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Unpin" })).toBeVisible();
});

it("saves an edit, and closes only once it has landed", async () => {
  const onSaveEdit = vi.fn();
  _render(
    <CommentRow
      comment={{ ...COMMENT, canEdit: true }}
      viewer={VIEWER}
      onSaveEdit={onSaveEdit}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: "What you wrote" });
  await userEvent.clear(field);
  await userEvent.type(field, "His father's chin, then.");
  await userEvent.click(
    screen.getByRole("button", { name: "Save the change" }),
  );

  expect(onSaveEdit).toHaveBeenCalledWith(
    "His father's chin, then.",
    expect.any(Function),
  );
  act(() => {
    onSaveEdit.mock.calls[0]?.[1]();
  });
  expect(screen.queryByRole("textbox", { name: "What you wrote" })).toBeNull();
});

it("deletes once the dialog is confirmed", async () => {
  const onDelete = vi.fn();
  _render(
    <CommentRow
      comment={{ ...COMMENT, canDelete: true }}
      viewer={VIEWER}
      onDelete={onDelete}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete it" }),
  );

  expect(onDelete).toHaveBeenCalledOnce();
});

it("draws the server's words rather than a local copy", () => {
  const { rerender } = _render(
    <CommentRow comment={COMMENT} viewer={VIEWER} />,
  );

  rerender(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <CommentRow
        comment={{ ...COMMENT, body: "Edited elsewhere." }}
        viewer={VIEWER}
      />
    </MantineProvider>,
  );

  expect(screen.getByText("Edited elsewhere.")).toBeVisible();
});
```

Add `act` to the `@testing-library/react` import and `vi` to the `vitest` import. `rerender` comes from the result `_render` already returns.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/Talk`
Expected: FAIL: `onSend` is never called, there is no alert, the edit field has no accessible name, and the body is a stale local copy.

- [ ] **Step 3: Rewrite `Composer.tsx`**

```tsx
import { Button, Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  goesTo: string;
  /**
   * Sends the words. Call `onSent` once the server has them, which is the
   * only thing that clears the field: a send that fails keeps every word.
   */
  onSend: (body: string, onSent: () => void) => void;
  isSending?: boolean;
  /** Why the last send did not go through, already in words. */
  error?: string;
  pinnedAt?: number;
  onClearPin?: () => void;
};

/**
 * The composer. Empty and disabled, typing and enabled, sending, and back to
 * empty: the states a real one needs, because a viewer who cannot work out
 * how to leave a comment is a product failure.
 */
export function Composer({
  goesTo,
  onSend,
  isSending = false,
  error,
  pinnedAt,
  onClearPin,
}: Readonly<Props>): ReactNode {
  const [body, setBody] = useState("");
  const canSend = body.trim().length > 0 && !isSending;

  return (
    <form
      className={classes.composer}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) {
          onSend(body, () => {
            setBody("");
          });
        }
      }}
    >
      <Textarea
        label={
          pinnedAt === undefined
            ? "Say something"
            : `Say something at ${clockLabel(pinnedAt)}`
        }
        placeholder="Anything at all. They will be glad you did."
        value={body}
        onChange={(event) => {
          return setBody(event.currentTarget.value);
        }}
        classNames={{
          label: classes.composerLabel,
          input: classes.composerField,
        }}
      />
      <div className={classes.composerRow}>
        <Button
          type="submit"
          disabled={!canSend}
          className={classes.composerSend}
          leftSection={<IconSend {...ICON_PROPS} />}
        >
          {isSending ? "Sending" : "Send"}
        </Button>
        {pinnedAt === undefined ? (
          <span className={classes.composerHint}>{goesTo}</span>
        ) : (
          <>
            <span className={classes.composerHint}>
              {`Pinned to ${clockLabel(pinnedAt)}`}
            </span>
            <Button variant="default" size="sm" onClick={onClearPin}>
              Unpin
            </Button>
          </>
        )}
      </div>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </form>
  );
}
```

- [ ] **Step 4: Write `CommentWhen.tsx`**

```tsx
import type { ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { agoLabel, clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
};

/**
 * When a comment was said, or the moment it is pinned to.
 *
 * A pinned comment carries a stamp that seeks the video instead of a plain
 * time, and the words a sighted reader gets from position ("this one jumps
 * to Abuela's comment") are carried for a screen reader in hidden text.
 */
export function CommentWhen({ comment, onSeek }: Readonly<Props>): ReactNode {
  const pinnedAt = comment.atSeconds;
  if (pinnedAt === null) {
    return (
      <span className={classes.commentWhen}>
        {agoLabel({ timestamp: comment.createdAt })}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes.stamp}
      onClick={() => {
        return onSeek?.(pinnedAt);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
      {clockLabel(pinnedAt)}
      <span className="visually-hidden">
        {` Jump to ${comment.author.displayName}'s comment`}
      </span>
    </button>
  );
}
```

- [ ] **Step 5: Write `CommentEditor.tsx`**

```tsx
import { Button, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  comment: CommentDto;
  isSaving: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
};

/**
 * Your own comment, open for editing.
 *
 * It says before saving that it will say it was edited, because a comment
 * that changes under a reader with no sign of it is worse than one that
 * could not change at all.
 */
export function CommentEditor({
  comment,
  isSaving,
  onSave,
  onCancel,
}: Readonly<Props>): ReactNode {
  const [draft, setDraft] = useState(comment.body);

  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      <span className={classes.commentWhen}>
        {agoLabel({ timestamp: comment.createdAt })}
      </span>
      <Textarea
        aria-label="What you wrote"
        value={draft}
        autosize
        minRows={2}
        onChange={(event) => {
          return setDraft(event.currentTarget.value);
        }}
        classNames={{ input: classes.composerField }}
      />
      <div className={classes.commentOwnActions}>
        <Button
          size="sm"
          disabled={draft.trim().length === 0 || isSaving}
          onClick={() => {
            return onSave(draft);
          }}
        >
          {isSaving ? "Saving" : "Save the change"}
        </Button>
        <Button size="sm" variant="default" onClick={onCancel}>
          Leave it as it was
        </Button>
        <span className={classes.commentEdited}>
          It will say it was edited.
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `CommentOwnActions.tsx`**

```tsx
import { Button, Modal, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  comment: CommentDto;
  onEdit: () => void;
  onDelete?: () => void;
};

/**
 * Edit and Delete under a comment, when the server says this viewer may.
 *
 * Editing is the author's alone. Deleting is the author's or an admin's, and
 * the dialog says which, because "Delete what you wrote?" is a false sentence
 * to an admin taking down somebody else's words.
 */
export function CommentOwnActions({
  comment,
  onEdit,
  onDelete,
}: Readonly<Props>): ReactNode {
  const [isDeleting, setIsDeleting] = useState(false);
  if (!comment.canEdit && !comment.canDelete) {
    return null;
  }
  return (
    <div className={classes.commentOwnActions}>
      {comment.canEdit ? (
        <button
          type="button"
          className={classes.commentOwnAction}
          onClick={onEdit}
        >
          Edit
        </button>
      ) : null}
      {comment.canDelete ? (
        <button
          type="button"
          className={classes.commentOwnAction}
          onClick={() => {
            return setIsDeleting(true);
          }}
        >
          Delete
        </button>
      ) : null}
      <Modal
        opened={isDeleting}
        onClose={() => {
          return setIsDeleting(false);
        }}
        title={
          comment.canEdit ? "Delete what you wrote?" : "Delete this comment?"
        }
      >
        <Stack gap="md">
          <Prose>
            It goes, and so does every reaction anybody left on it. The
            photograph stays. Anybody who was emailed it still has that email,
            which is not something deleting can reach.
          </Prose>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                setIsDeleting(false);
                onDelete?.();
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Keep it
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite `CommentRow.tsx`**

```tsx
import { useState, type ReactNode } from "react";
import type {
  CommentDto,
  MemberRef,
  ReactionKind,
} from "@memory-shoebox/shared";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import { Reactions } from "@/system/Reactions/Reactions";
import { CommentEditor } from "@/system/Talk/CommentEditor";
import { CommentOwnActions } from "@/system/Talk/CommentOwnActions";
import { CommentWhen } from "@/system/Talk/CommentWhen";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** Who is looking, so a reaction answers before the server hears about it. */
  viewer: MemberRef;
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
  /** Saves an edit. Call `onSaved` once the server has the new words. */
  onSaveEdit?: (body: string, onSaved: () => void) => void;
  isSaving?: boolean;
  onDelete?: () => void;
  onReact?: (kind: ReactionKind | null) => void;
  /** Whatever went wrong with this comment, already in words. */
  error?: string;
};

/**
 * One comment. A pinned one carries a stamp instead of a plain clock time.
 *
 * The body drawn is always the server's (`comment.body`), never a local copy:
 * an edit lands in the item's cache and arrives here as a prop, and so does
 * an edit made in another tab. Editing and deleting are offered exactly when
 * the server's `canEdit` and `canDelete` say so.
 */
export function CommentRow({
  comment,
  viewer,
  onSeek,
  onSaveEdit,
  isSaving = false,
  onDelete,
  onReact,
  error,
}: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const failure =
    error === undefined ? null : <Prose role="alert">{error}</Prose>;

  // `canEdit` is re-read rather than trusted from the moment Edit was
  // pressed: a refetch can take the right away underneath somebody who is
  // mid-sentence, and leaving the form up would offer a save the server is
  // going to refuse.
  if (isEditing && comment.canEdit) {
    return (
      <>
        <CommentEditor
          comment={comment}
          isSaving={isSaving}
          onCancel={() => {
            return setIsEditing(false);
          }}
          onSave={(body) => {
            onSaveEdit?.(body, () => {
              setIsEditing(false);
            });
          }}
        />
        {failure}
      </>
    );
  }

  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      <CommentWhen comment={comment} onSeek={onSeek} />
      <p className={classes.commentBody}>
        {comment.body}
        {comment.editedAt === null ? null : (
          <>
            {" "}
            <span className={classes.commentEdited}>
              {`edited ${agoLabel({ timestamp: comment.editedAt })}`}
            </span>
          </>
        )}
      </p>
      <div className={classes.commentReactions}>
        <Reactions
          reactions={comment.reactions}
          viewer={viewer}
          onReact={onReact}
        />
      </div>
      <CommentOwnActions
        comment={comment}
        onEdit={() => {
          return setIsEditing(true);
        }}
        onDelete={onDelete}
      />
      {failure}
    </div>
  );
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/Talk && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS (the four existing cases and the six new ones), type-check clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/system/Talk
git commit -m "feat(web): the composer and a comment's edit and delete really send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The video transport is a slider, with its marks from the contract

**Files:**

- Modify: `apps/web/src/system/VideoFrame/VideoFrame.tsx`
- Create: `apps/web/src/system/VideoFrame/TransportSlider.tsx`
- Create: `apps/web/src/system/VideoFrame/TransportMarks.tsx`
- Create: `apps/web/src/system/VideoFrame/TransportPlay.tsx`
- Create: `apps/web/src/system/VideoFrame/playVideo.ts`
- Modify: `apps/web/src/system/VideoFrame/VideoFrame.test.tsx`
- Modify: `apps/web/src/system/system.module.css`

Decision 7. The position becomes the caller's (`position` and `onPositionChange`), because the pin is placed from it and the e2e catalog has no media, so the element's own `currentTime` is not a source of truth anyone can read. `startPlaying` goes: nothing autoplays.

- [ ] **Step 1: Rewrite the test file**

```tsx
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaRef } from "@memory-shoebox/shared";
import { createRef, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VideoFrame, type TransportMark } from "@/system/VideoFrame/VideoFrame";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _source(url: string) {
  return {
    url,
    expiresAt: "2099-01-01T00:00:00.000Z",
    width: 800,
    height: 600,
  };
}

const MEDIA: MediaRef = {
  thumb: _source("https://example.test/t.jpg"),
  display: _source("https://example.test/d.jpg"),
  poster: null,
  video: null,
  durationMs: 22_000,
  altText: "Mateo on the day he was born",
};

const MARK: TransportMark = {
  id: "c1",
  atSeconds: 11,
  label: "Jump to Abuela Rosa's comment at 0:11",
};

type Props = {
  marks?: readonly TransportMark[];
  durationMs?: number | null;
  onScrub?: (seconds: number) => void;
  onPositionChange?: (seconds: number) => void;
};

/** Holds the position the way the item viewer does, so keys can move it. */
function Harness({
  marks = [],
  durationMs = 22_000,
  onScrub,
  onPositionChange,
}: Readonly<Props>): ReactNode {
  const [position, setPosition] = useState(0);
  return (
    <VideoFrame
      media={{ ...MEDIA, durationMs }}
      marks={marks}
      videoRef={createRef<HTMLVideoElement>()}
      position={position}
      onPositionChange={(seconds) => {
        setPosition(seconds);
        onPositionChange?.(seconds);
      }}
      onScrub={onScrub}
    />
  );
}

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the video frame", () => {
  it("reads the clock against the contract's duration before anything loads", () => {
    _render(<Harness />);

    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
    expect(screen.getByText("0:00 / 0:22")).toBeVisible();
  });

  it("places a pinned comment's mark on first paint, from durationMs", () => {
    _render(<Harness marks={[MARK]} />);

    expect(screen.getByRole("button", { name: MARK.label })).toHaveStyle({
      left: "50%",
    });
  });

  it("draws no mark when it cannot know how long the video is", () => {
    _render(<Harness marks={[MARK]} durationMs={null} />);

    expect(screen.queryByRole("button", { name: MARK.label })).toBeNull();
  });

  it("moves a second at a time with the arrow keys, and says where it is", async () => {
    const onScrub = vi.fn();
    _render(<Harness onScrub={onScrub} />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    expect(slider).toHaveAttribute("aria-valuetext", "0:02 of 0:22");
    expect(onScrub).toHaveBeenLastCalledWith(2);
  });

  it("goes to either end with End and Home", async () => {
    _render(<Harness />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    slider.focus();
    await userEvent.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:22 of 0:22");
    await userEvent.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:22");
  });

  it("seeks where the bar is pressed", () => {
    const onScrub = vi.fn();
    _render(<Harness onScrub={onScrub} />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    const box = slider.getBoundingClientRect();
    fireEvent.click(slider, { clientX: box.left + box.width / 2 });

    expect(onScrub).toHaveBeenCalledWith(11);
  });

  it("seeks to a mark without counting as a press on the bar", async () => {
    const onScrub = vi.fn();
    const onPositionChange = vi.fn();
    _render(
      <Harness
        marks={[MARK]}
        onScrub={onScrub}
        onPositionChange={onPositionChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: MARK.label }));

    expect(onPositionChange).toHaveBeenCalledWith(11);
    expect(onScrub).not.toHaveBeenCalled();
  });
});
```

Check `apps/web/vitest.setup.ts`'s `getBoundingClientRect` shim before relying on the press test: it returns a plausible non-zero box for every element, so `box.left + box.width / 2` lands on the middle. If the shim's box has `left: 0` and `width: W`, the press lands at `W / 2` and the fraction is exactly one half.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/VideoFrame`
Expected: FAIL: the clock reads "0:00 / 0:00", there is no slider, and `position` is not a prop.

- [ ] **Step 3: Write `playVideo.ts`**

```ts
/**
 * Starts playback and swallows the refusal.
 *
 * An autoplay policy, or a file that never loaded, rejects `play()`; neither
 * is worth an error, because the frame still shows where the transport
 * stands. `Promise.resolve` is there because jsdom's `play()` returns nothing
 * at all rather than a promise, and a bare `.catch` on that would throw.
 */
export function playVideo(video: HTMLVideoElement): void {
  void Promise.resolve(video.play()).catch(() => {
    // Refused. The transport still stands where it was asked to.
  });
}
```

- [ ] **Step 4: Write `TransportPlay.tsx`**

```tsx
import type { ReactNode, RefObject } from "react";
import { PlayGlyph } from "@/system/icons";
import { playVideo } from "@/system/VideoFrame/playVideo";
import classes from "@/system/system.module.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
};

/** The square play button: Play while paused, Pause while playing. */
export function TransportPlay({
  videoRef,
  isPlaying,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      className={classes.transportPlay}
      aria-label={isPlaying ? "Pause" : "Play"}
      onClick={() => {
        const video = videoRef.current;
        if (!video) {
          return;
        }
        if (video.paused) {
          playVideo(video);
        } else {
          video.pause();
        }
      }}
    >
      <PlayGlyph paused={!isPlaying} />
    </button>
  );
}
```

- [ ] **Step 5: Write `TransportSlider.tsx`**

```tsx
import { useRef, type ReactNode } from "react";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  position: number;
  duration: number;
  /** A position chosen on the bar, by a press or a key. */
  onSeek: (seconds: number) => void;
};

/**
 * Where a key takes the transport, or undefined for a key that is not one of
 * the slider's.
 *
 * The keys WAI-ARIA gives a slider: a second each way on the arrows, a tenth
 * of the video on Page Up and Page Down, and the two ends on Home and End.
 */
function _getPositionFromKey(options: {
  key: string;
  position: number;
  duration: number;
}): number | undefined {
  const { key, position, duration } = options;
  const tenth = duration / 10;
  const positionByKey: Record<string, number> = {
    ArrowRight: position + 1,
    ArrowUp: position + 1,
    ArrowLeft: position - 1,
    ArrowDown: position - 1,
    PageUp: position + tenth,
    PageDown: position - tenth,
    Home: 0,
    End: duration,
  };
  const next = positionByKey[key];
  return next === undefined ? undefined : Math.min(Math.max(next, 0), duration);
}

/**
 * The scrubber, as a slider a keyboard can hold.
 *
 * It covers the whole bar under the marks, so a press anywhere seeks there and
 * nothing needs dragging (`PRODUCT.md` § Accessibility & Inclusion). Its
 * children are the tick rule, the track and the played bar, all decorative,
 * which is the only kind of child a slider may have.
 */
export function TransportSlider({
  position,
  duration,
  onSeek,
}: Readonly<Props>): ReactNode {
  const sliderRef = useRef<HTMLDivElement>(null);
  const playedFraction = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={0}
      className={classes.scrubberSlider}
      aria-label="Where in the video"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={position}
      aria-valuetext={`${clockLabel(position)} of ${clockLabel(duration)}`}
      onClick={(event) => {
        const box = sliderRef.current?.getBoundingClientRect();
        if (!box || box.width === 0) {
          return;
        }
        const fraction = Math.min(
          Math.max((event.clientX - box.left) / box.width, 0),
          1,
        );
        onSeek(fraction * duration);
      }}
      onKeyDown={(event) => {
        const next = _getPositionFromKey({
          key: event.key,
          position,
          duration,
        });
        if (next !== undefined) {
          event.preventDefault();
          onSeek(next);
        }
      }}
    >
      <div className={classes.scrubberRules} aria-hidden="true" />
      <div className={classes.scrubberTrack} aria-hidden="true" />
      <div
        className={classes.scrubberPlayed}
        style={{ width: `${playedFraction * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
```

- [ ] **Step 6: Write `TransportMarks.tsx`**

```tsx
import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TransportMark } from "@/system/VideoFrame/VideoFrame";
import classes from "@/system/system.module.css";

type Props = {
  marks: readonly TransportMark[];
  pendingAt?: number;
  duration: number;
  onSeek: (seconds: number) => void;
};

/**
 * The pinned-comment marks, and the outlined one being placed.
 *
 * A layer over the slider rather than inside it: a slider's children are
 * presentational to assistive technology, so a mark nested in it could not be
 * reached. The layer lets presses through to the bar between its marks.
 *
 * With no duration there is no scale to place a mark on, and a mark parked at
 * 0:00 points at a moment that is not there, so the layer draws nothing.
 */
export function TransportMarks({
  marks,
  pendingAt,
  duration,
  onSeek,
}: Readonly<Props>): ReactNode {
  if (duration <= 0) {
    return null;
  }
  const leftOf = (seconds: number) => {
    return `${(Math.min(seconds, duration) / duration) * 100}%`;
  };
  return (
    <div className={classes.scrubberMarks}>
      {marks.map((mark) => {
        return (
          <button
            key={mark.id}
            type="button"
            className={classes.scrubberMark}
            style={{ left: leftOf(mark.atSeconds) }}
            aria-label={mark.label}
            onClick={() => {
              return onSeek(mark.atSeconds);
            }}
          />
        );
      })}
      {pendingAt === undefined ? null : (
        <span
          className={clsx(classes.scrubberMark, classes.scrubberMarkPending)}
          style={{ left: leftOf(pendingAt) }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Rewrite `VideoFrame.tsx`**

```tsx
import { useState, type RefObject, type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { TransportMarks } from "@/system/VideoFrame/TransportMarks";
import { TransportPlay } from "@/system/VideoFrame/TransportPlay";
import { TransportSlider } from "@/system/VideoFrame/TransportSlider";
import classes from "@/system/system.module.css";

/** One pinned comment, as the transport draws it. */
export type TransportMark = {
  readonly id: string;
  readonly atSeconds: number;
  readonly label: string;
};

type Props = {
  media: MediaRef;
  marks: readonly TransportMark[];
  pendingAt?: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * Where the transport stands, in seconds. The caller holds it, because a
   * comment is pinned from it and a video that never loads has no
   * `currentTime` anybody can trust.
   */
  position: number;
  /** Every change of position: playback, the bar, a key, a mark. */
  onPositionChange: (seconds: number) => void;
  /** A position chosen on the bar itself, by a press or a key. */
  onScrub?: (seconds: number) => void;
};

/** The two encodings the contract carries, in preference order. */
function _sourcesOf(
  media: MediaRef,
): ReadonlyArray<{ readonly url: string; readonly type: string }> {
  if (media.video === null) {
    return [];
  }
  return [
    { source: media.video.webm, type: "video/webm" },
    { source: media.video.mp4, type: "video/mp4" },
  ].flatMap((candidate) => {
    return candidate.source === null
      ? []
      : [{ url: candidate.source.url, type: candidate.type }];
  });
}

/**
 * A video in its frame, standing on a measured transport bar.
 *
 * **The duration is the contract's.** `media.durationMs` is non-null for every
 * video (`items.md` transformation 4), so every mark lands where it belongs on
 * first paint instead of jumping once metadata loads; the element's own
 * duration is the fallback for a payload that somehow lacks it.
 */
export function VideoFrame({
  media,
  marks,
  pendingAt,
  videoRef,
  position,
  onPositionChange,
  onScrub,
}: Readonly<Props>): ReactNode {
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const duration =
    media.durationMs === null ? loadedDuration : media.durationMs / 1000;

  const seekTo = (seconds: number): number => {
    const clamped = Math.min(Math.max(seconds, 0), duration);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    onPositionChange(clamped);
    return clamped;
  };

  return (
    <div className={classes.frame}>
      <video
        ref={videoRef}
        poster={media.poster?.url}
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          setLoadedDuration(Number.isFinite(seconds) ? seconds : 0);
        }}
        onTimeUpdate={(event) => {
          return onPositionChange(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          return setIsPlaying(true);
        }}
        onPause={() => {
          return setIsPlaying(false);
        }}
      >
        {_sourcesOf(media).map((source) => {
          return (
            <source key={source.url} src={source.url} type={source.type} />
          );
        })}
      </video>
      <div className={classes.transport}>
        <TransportPlay videoRef={videoRef} isPlaying={isPlaying} />
        <span className={classes.transportClock}>
          {clockLabel(position)} / {clockLabel(duration)}
        </span>
        <div className={classes.scrubber}>
          <TransportSlider
            position={position}
            duration={duration}
            onSeek={(seconds) => {
              onScrub?.(seekTo(seconds));
            }}
          />
          <TransportMarks
            marks={marks}
            pendingAt={pendingAt}
            duration={duration}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add the slider's and the marks layer's CSS**

In `apps/web/src/system/system.module.css`, directly after the `.scrubber { ... }` rule, add:

```css
/*
 * The bar a keyboard can hold. It covers the whole scrubber under the marks,
 * so a press anywhere seeks there, and its focus ring is the product's one
 * ring.
 */
.scrubberSlider {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

/*
 * The marks sit over the slider rather than inside it, because a slider's
 * children are presentational to assistive technology. The layer lets presses
 * through to the bar; its marks take their own.
 */
.scrubberMarks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scrubberMarks .scrubberMark {
  pointer-events: auto;
}

.scrubberMarks .scrubberMarkPending {
  pointer-events: none;
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/system/VideoFrame && pnpm --filter @memory-shoebox/web type-check && pnpm lint`
Expected: PASS, clean, clean. If `pnpm lint` reports `jsx-a11y` on the slider `div` (an interactive role on a non-interactive element), the `role`, `tabIndex`, `aria-value*` and `onKeyDown` already satisfy the rule's intent; add a one-line `// oxlint-disable-next-line <rule>` with the reason only if the rule cannot see that.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/system/VideoFrame apps/web/src/system/system.module.css
git commit -m "feat(web): the video transport is a slider, and its marks come from the contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase D: the pile links in

### Task 13: Fanned frames are `BurstFrameRef`s, and they open the viewer

**Files:**

- Modify: `apps/web/src/api/bursts/bursts.ts`
- Create: `apps/web/src/api/bursts/bursts.test.ts`
- Modify: `apps/web/src/api/seen/seen.ts` (drop `frameSchema` and its now-unused `itemSummarySchema` import)
- Modify: `apps/web/src/system/Pile/Print.tsx`, `BurstStack.tsx`, `PileItems/PileItems.tsx`, `PileItems/BurstStackItem.tsx`
- Modify: `apps/web/src/system/Pile/Pile.test.tsx`
- Modify: `apps/web/src/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan.ts` and its test
- Modify: `apps/web/src/surfaces/Timeline/DayStream.tsx`, `DayBlock/DayBlock.tsx`, `TimelineSurface/ArchiveBody.tsx`, `TimelineSurface/useTimelineData.ts` (the `framesByBurstId` type only)

Decision 13. Step 5b wrote `bursts.ts` against a guessed `ItemSummary[]`; step 5a's route answers `BurstFrameRef[]` (`burstFramesResponseSchema` in `packages/shared/src/items.ts`), so against a real server the fan never opens.

- [ ] **Step 1: Write the failing test**

`apps/web/src/api/bursts/bursts.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { BURST_ID, makeBurstFrame } from "@/testing/itemFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("burstFramesQueryOptions", () => {
  it("parses what step 5a's route actually answers, which is BurstFrameRef", async () => {
    const answer = {
      frames: [makeBurstFrame(1), makeBurstFrame(2)],
      nextCursor: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify(answer), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const options = burstFramesQueryOptions(BURST_ID);
    const queryFn = options.queryFn as NonNullable<typeof options.queryFn>;

    await expect(queryFn({} as Parameters<typeof queryFn>[0])).resolves.toEqual(
      answer,
    );
  });
});
```

In `Pile.test.tsx`, import `makeBurstFrame` and `makeFrameIdFromPosition` from `@/testing/itemFixtures` and `vi` from `vitest`, change the "fans once somebody hands it the frames" case's `frames` to `[makeBurstFrame(1), makeBurstFrame(2)]`, and add inside `describe("a burst that has not been opened yet", ...)`:

```tsx
it("opens a fanned frame in the viewer when it is pressed", async () => {
  const onOpenFrame = vi.fn();
  _render(
    <Pile>
      <BurstStack
        cover={_item()}
        frames={[makeBurstFrame(1), makeBurstFrame(2)]}
        frameCount={2}
        span="2 frames"
        seed={0}
        startOpen
        onOpenFrame={onOpenFrame}
      />
    </Pile>,
  );

  const frames = screen.getAllByRole("button", {
    name: "Mateo, 14 September 2026",
  });
  await userEvent.click(frames[1]!);

  expect(onOpenFrame).toHaveBeenCalledWith(makeFrameIdFromPosition(2));
});
```

(Import `userEvent` from `@testing-library/user-event` if `Pile.test.tsx` does not already.)

In `useBurstFan.test.tsx`, replace the two `makeItem(...)` frames with `makeBurstFrame(1)` and `makeBurstFrame(2)` from `@/testing/itemFixtures`, and change `AnswerFetch` to take `readonly BurstFrameRef[]` (importing the type from `@memory-shoebox/shared`).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api/bursts src/system/Pile src/surfaces/Timeline/TimelineSurface/useBurstFan`
Expected: FAIL: the bursts query rejects the `BurstFrameRef` body with a ZodError, and `onOpenFrame` is not a prop.

- [ ] **Step 3: Parse the shared schema in `bursts.ts`**

Replace the file's imports and the local schema and type with:

```ts
import {
  burstFramesResponseSchema,
  type BurstFramesResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client/client";
```

delete the local `burstFramesResponseSchema` and `BurstFramesResponse` declarations and their docstring, and change the `apiFetch` call's schema to the imported `burstFramesResponseSchema`. Keep `makeFramesPathFromBurstId` and its docstring. Replace `burstFramesQueryOptions`'s docstring with:

```ts
/**
 * One burst's visible frames, fetched when somebody presses the stack or when
 * the item viewer's strip needs more than the sixty `ItemDetail` carries.
 *
 * `BurstFrameRef[]`, as `items.md` § `GET /api/bursts/:burstId/frames` fixes
 * it: an id, a dense position, a thumb and an alt text, and nothing that would
 * let a gap in the stored order count what the viewer cannot see. The route
 * latches `first_seen_at` for the burst itself.
 */
```

- [ ] **Step 4: Drop the stale re-export from `seen.ts`**

Delete the last two lines of `apps/web/src/api/seen/seen.ts` (`/** The shape one fanned frame comes back as. ... */` and `export const frameSchema = itemSummarySchema;`) and remove `itemSummarySchema` from its import from `@memory-shoebox/shared`.

- [ ] **Step 5: Narrow `Print`'s media**

In `Print.tsx`:

```ts
import type { MediaRef } from "@memory-shoebox/shared";

/**
 * What a print draws: a pile print's whole `MediaRef`, or a fanned frame's
 * thumb and alt text, which is all a `BurstFrameRef` carries.
 */
export type PrintMedia = Pick<MediaRef, "thumb" | "altText"> & {
  readonly durationMs?: number | null;
};

type Props = {
  media: PrintMedia;
```

and the runtime chip's condition becomes:

```tsx
      {media.durationMs === null || media.durationMs === undefined ? null : (
```

- [ ] **Step 6: Let a fanned frame open the viewer**

In `BurstStack.tsx`, import `BurstFrameRef` instead of using `ItemSummary` for the frames, and change the props:

```ts
import type { BurstFrameRef, ItemSummary } from "@memory-shoebox/shared";

type Props = {
  cover: ItemSummary;
  /** Absent until the burst has been opened and its frames fetched. */
  frames?: readonly BurstFrameRef[];
  /** How many frames this viewer can see. Never a stored count. */
  frameCount: number;
  span: string;
  seed: number;
  /** Called when the collapsed stack is pressed. A later step fetches them. */
  onOpen?: () => void;
  /** Called with a fanned frame's id when it is pressed: the viewer opens. */
  onOpenFrame?: (itemId: string) => void;
  startOpen?: boolean;
  /** The burst this stack stands for, written to the DOM for the latch. */
  burstId?: string;
  /**
   * Whether any visible frame behind this cover is still unseen.
   *
   * The stack draws one cover for frames the client holds no `isUnseen` for,
   * so without this the accent would drain: a day saying "31 new" would carry
   * no dot on the object holding twelve of them.
   */
  hasUnseenFrames?: boolean;
};
```

add `onOpenFrame` to the destructured props, and change the fanned print to:

```tsx
{
  (frames ?? []).map((frame, index) => {
    return (
      <Print
        key={frame.itemId}
        media={frame}
        seed={seed + index + 1}
        onClick={() => {
          return onOpenFrame?.(frame.itemId);
        }}
      />
    );
  });
}
```

In `PileItems/BurstStackItem.tsx`, change `framesByBurstId` to `ReadonlyMap<string, readonly BurstFrameRef[]>` (import the type), add `onOpenItem?: (itemId: string) => void;` to `Props` and the destructuring, and pass `onOpenFrame={onOpenItem}` to `BurstStack`.

In `PileItems/PileItems.tsx`, change `framesByBurstId` the same way and pass `onOpenItem={onOpenItem}` to `BurstStackItem`.

- [ ] **Step 7: Retype the timeline's frames**

Change every `ReadonlyMap<string, readonly ItemSummary[]>` and `Map<string, readonly ItemSummary[]>` to the `BurstFrameRef` form in `useBurstFan.ts`, `DayStream.tsx`, `DayBlock/DayBlock.tsx`, `TimelineSurface/ArchiveBody.tsx` and `TimelineSurface/useTimelineData.ts` (three occurrences there), importing `BurstFrameRef` from `@memory-shoebox/shared` and dropping `ItemSummary` from any import left unused. In `useBurstFan.ts`, delete the paragraph of its `_makeOnOpenBurst` docstring that begins "A failed fetch leaves the stack closed rather than throwing: `5a` owns" and replace it with: "A failed fetch leaves the stack closed rather than throwing, which is indistinguishable from pressing a burst whose frames have all been restricted since the page loaded." Also drop the comment line "Frames arrive from the burst's own route, which step 5a owns." to "Frames arrive from the burst's own route."

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/api src/system/Pile src/surfaces/Timeline && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/api apps/web/src/system/Pile apps/web/src/surfaces/Timeline
git commit -m "fix(web): the fan parses what step 5a's frames route returns, and a frame opens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: A print in the pile opens the viewer

**Files:**

- Modify: `apps/web/src/surfaces/Timeline/TimelineSurface/TimelinePile.tsx`
- Modify: `apps/web/src/surfaces/Timeline/TimelineSurface/ArchiveBody.tsx`
- Modify: `apps/web/src/surfaces/Timeline/DayStream.tsx`
- Modify: `apps/web/src/surfaces/Timeline/DayBlock/DayBlock.tsx`
- Modify: `apps/web/src/surfaces/Timeline/TimelineSurface/__tests__/TimelineSurface.pile.test.tsx`

`PlainPrint` already calls `onOpenItem`; nothing passes it. Prints stay buttons that navigate on press rather than links, so the router's intent preloading never sees them at all.

- [ ] **Step 1: Write the failing test**

Add to `TimelineSurface.pile.test.tsx` (import `userEvent` if missing):

```tsx
it("opens a print in the item viewer", async () => {
  const { router } = renderTimeline();

  await userEvent.click(
    await screen.findByRole("button", {
      name: "A cartoon baby, 27 September 2026.",
    }),
  );

  await waitFor(() => {
    expect(router.state.location.pathname).toBe(
      "/items/018f0000-0000-7000-8000-00000000a001",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Timeline/TimelineSurface/__tests__/TimelineSurface.pile.test.tsx`
Expected: FAIL, the pathname stays `/`.

- [ ] **Step 3: Thread `onOpenItem` down**

`DayBlock.tsx`: add `onOpenItem: (itemId: string) => void;` to `Props` and the destructuring, and pass `onOpenItem={onOpenItem}` to `PileItems`.

`DayStream.tsx`: add the same prop and pass it to each `DayBlock`.

`ArchiveBody.tsx`: add the same prop and pass it to `DayStream`.

`TimelinePile.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
```

and inside `TimelinePile`, before the `return`:

```tsx
const navigate = useNavigate();
// A print is a button that navigates rather than a link, so the router's
// intent preloading never sees it. The item route has no loader in any case
// (decision 1 of the step 6b design): an open is counted by the fetch, and
// a hover is not an open.
const onOpenItem = (itemId: string) => {
  void navigate({ to: "/items/$itemId", params: { itemId } });
};
```

and pass `onOpenItem={onOpenItem}` to `ArchiveBody`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Timeline && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/surfaces/Timeline
git commit -m "feat(web): a print in the pile opens the item viewer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase E: the item surface

### Task 15: The writes, and what they do to the cache

**Files:**

- Create: `apps/web/src/surfaces/Item/itemWrites/itemWriteScope.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates.test.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/useItemDetailWrite.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/useItemEdits.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/useConversation.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/useDeleteItem.ts`
- Create: `apps/web/src/surfaces/Item/itemWrites/__tests__/itemWrites.test.tsx`

Decision 2. Every write answers with its post-mutation state and that answer goes into the item's cache entry; nothing invalidates it, because invalidating is a refetch and a refetch is an open.

- [ ] **Step 1: Write the failing tests for the pure updates**

`itemCacheUpdates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  makeItemDetailFromCommentReactions,
  makeItemDetailFromDeletedComment,
  makeItemDetailFromItemReactions,
  makeItemDetailFromSavedComment,
} from "@/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates";
import { makeComment, makeItemDetail, SIGNED_IN } from "@/testing/itemFixtures";

const FIRST = makeComment();
const SECOND = makeComment({
  commentId: "018f0000-0000-7000-8000-00000000d102",
  body: "Second.",
});
const LOVE = {
  kinds: [{ kind: "love" as const, count: 1, members: [SIGNED_IN] }],
  myKind: "love" as const,
};

describe("the cache updates", () => {
  it("appends a new comment at the foot of the thread", () => {
    const detail = makeItemDetail({ comments: [FIRST] });
    expect(
      makeItemDetailFromSavedComment({ detail, comment: SECOND }).comments,
    ).toEqual([FIRST, SECOND]);
  });

  it("replaces an edited comment where it stands", () => {
    const edited = { ...FIRST, body: "Edited." };
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    expect(
      makeItemDetailFromSavedComment({ detail, comment: edited }).comments,
    ).toEqual([edited, SECOND]);
  });

  it("takes a deleted comment out", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    expect(
      makeItemDetailFromDeletedComment({ detail, commentId: FIRST.commentId })
        .comments,
    ).toEqual([SECOND]);
  });

  it("puts a summary on the item, or on one comment", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    expect(
      makeItemDetailFromItemReactions({ detail, reactions: LOVE }).reactions,
    ).toEqual(LOVE);
    const onComment = makeItemDetailFromCommentReactions({
      detail,
      commentId: SECOND.commentId,
      reactions: LOVE,
    });
    expect(onComment.comments[1]?.reactions).toEqual(LOVE);
    expect(onComment.comments[0]?.reactions).toEqual(FIRST.reactions);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemWrites/itemCacheUpdates`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `itemCacheUpdates.ts`**

```ts
import type {
  CommentDto,
  ItemDetail,
  ReactionSummary,
} from "@memory-shoebox/shared";

/**
 * Pure updates of a cached `ItemDetail`, one per answer a write can give that
 * is not itself a whole `ItemDetail`.
 *
 * Kept apart from the hooks so that what each answer does to the page can be
 * read, and tested, without a query client.
 */

/** A comment the server has just accepted: new at the foot, edited in place. */
export function makeItemDetailFromSavedComment(options: {
  detail: ItemDetail;
  comment: CommentDto;
}): ItemDetail {
  const { detail, comment } = options;
  const isKnown = detail.comments.some((candidate) => {
    return candidate.commentId === comment.commentId;
  });
  return {
    ...detail,
    comments: isKnown
      ? detail.comments.map((candidate) => {
          return candidate.commentId === comment.commentId
            ? comment
            : candidate;
        })
      : [...detail.comments, comment],
  };
}

/** A comment the server has taken down, which answers `204`. */
export function makeItemDetailFromDeletedComment(options: {
  detail: ItemDetail;
  commentId: string;
}): ItemDetail {
  return {
    ...options.detail,
    comments: options.detail.comments.filter((candidate) => {
      return candidate.commentId !== options.commentId;
    }),
  };
}

/** The item's own reaction summary, replaced. */
export function makeItemDetailFromItemReactions(options: {
  detail: ItemDetail;
  reactions: ReactionSummary;
}): ItemDetail {
  return { ...options.detail, reactions: options.reactions };
}

/** One comment's reaction summary, replaced. */
export function makeItemDetailFromCommentReactions(options: {
  detail: ItemDetail;
  commentId: string;
  reactions: ReactionSummary;
}): ItemDetail {
  return {
    ...options.detail,
    comments: options.detail.comments.map((candidate) => {
      return candidate.commentId === options.commentId
        ? { ...candidate, reactions: options.reactions }
        : candidate;
    }),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemWrites/itemCacheUpdates`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the hooks**

`itemWrites/__tests__/itemWrites.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itemQueryOptions } from "@/api/items/items";
import {
  useCreateComment,
  useItemReaction,
} from "@/surfaces/Item/itemWrites/useConversation";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";

/** One canned reply, optionally held until a test lets it go. */
type Reply = { status: number; body?: unknown; hold?: Promise<void> };

const lines: string[] = [];

/** Answers by `"METHOD /path"`, and records every request as one line. */
function _answer(replies: Readonly<Record<string, Reply>>): void {
  lines.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const line = `${init?.method ?? "GET"} ${String(url)}`;
      lines.push(line);
      const reply = replies[line] ?? {
        status: 404,
        body: { error: "not_found", message: "x" },
      };
      await reply.hold;
      return new Response(
        reply.status === 204 ? null : JSON.stringify(reply.body),
        {
          status: reply.status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/**
 * A client holding one item, as if the page had already opened it.
 *
 * The defaults go in first, so the cached entry has the query function the
 * page's own `useQuery` would have given it: an entry made by `setQueryData`
 * alone has none, and a refetch of it would fail without sending anything.
 */
function _clientHolding(detail = makeItemDetail()): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const options = itemQueryOptions(ITEM_ID);
  queryClient.setQueryDefaults(options.queryKey, { queryFn: options.queryFn });
  queryClient.setQueryData(options.queryKey, detail);
  return queryClient;
}

/** Renders a hook against that client. */
function _renderWithClient<T>(hook: () => T, queryClient: QueryClient) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  });
}

/** What the cache holds for the item now. */
function _cached(queryClient: QueryClient) {
  return queryClient.getQueryData(itemQueryOptions(ITEM_ID).queryKey);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write that answers with the item", () => {
  it("puts the answer in the cache and asks for nothing else", async () => {
    const answer = makeItemDetail({
      tags: [{ tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" }],
    });
    _answer({
      [`PUT /api/items/${ITEM_ID}/tags`]: { status: 200, body: answer },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(
      () => useSetItemTags(ITEM_ID),
      queryClient,
    );

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(_cached(queryClient)?.tags).toEqual(answer.tags);
    });
    expect(lines).toEqual([`PUT /api/items/${ITEM_ID}/tags`]);
  });

  it("asks for the item once more when the server refuses, and says why", async () => {
    _answer({
      [`PUT /api/items/${ITEM_ID}/tags`]: {
        status: 403,
        body: { error: "item_edit_forbidden", message: "x" },
      },
      [`GET /api/items/${ITEM_ID}`]: { status: 200, body: makeItemDetail() },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(
      () => useSetItemTags(ITEM_ID),
      queryClient,
    );

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(
        "You can no longer change this one. The page has caught up with what you may do.",
      );
    });
    await waitFor(() => {
      expect(lines).toContain(`GET /api/items/${ITEM_ID}`);
    });
  });
});

describe("a reaction", () => {
  it("shows the tap at once, and puts it back when it fails", async () => {
    let letGo = () => {};
    const hold = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    _answer({
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        status: 500,
        body: { error: "internal", message: "x" },
        hold,
      },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(
      () => useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN }),
      queryClient,
    );

    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(_cached(queryClient)?.reactions.myKind).toBe("love");
    });

    await act(async () => {
      letGo();
    });
    await waitFor(() => {
      expect(_cached(queryClient)?.reactions.myKind).toBeNull();
    });
    expect(result.current.error).toBe(
      "That reaction did not go through, so it has been put back. Try again.",
    );
  });
});

describe("a comment", () => {
  it("lands at the foot of the thread, and clears the field only then", async () => {
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    _answer({
      [`POST /api/items/${ITEM_ID}/comments`]: { status: 201, body: comment },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(
      () => useCreateComment(ITEM_ID),
      queryClient,
    );
    const onSent = vi.fn();

    act(() => {
      result.current.send({ body: "Hello.", atSeconds: null }, onSent);
    });

    await waitFor(() => {
      expect(_cached(queryClient)?.comments).toEqual([comment]);
    });
    expect(onSent).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemWrites`
Expected: FAIL, the hook modules do not exist.

- [ ] **Step 7: Implement `itemWriteScope.ts`**

```ts
import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api/client/client";
import { itemQueryOptions } from "@/api/items/items";
import { TIMELINE_QUERY_KEY } from "@/api/timeline/timeline";

/**
 * The scope every write on one item shares, which serialises them.
 *
 * **Not a nicety.** Five of these writes answer with a whole `ItemDetail`
 * carrying that request's own snapshot of everything it did not change, and
 * each answer replaces the cache entry. Two close together could land out of
 * order and revert each other; TanStack Query sends a scoped mutation only
 * once the one before it has been applied. It does not delay an optimistic
 * reaction, because `onMutate` runs before the scope gates the request.
 * `docs/web.md` § Surface 9 records the same fix for `PATCH /api/me`.
 */
export function makeWriteScopeFromItemId(itemId: string): { id: string } {
  return { id: `item:${itemId}` };
}

/** Every query outside the item itself whose answer an item write can change. */
const PILE_QUERY_KEYS = [
  TIMELINE_QUERY_KEY,
  ["filters"],
  ["tags"],
  ["people"],
  ["bursts"],
] as const;

/**
 * Marks the pile, its facets, its vocabularies and the burst fans stale,
 * without refetching any of them.
 *
 * None is mounted while the viewer is, so each refetches when somebody
 * returns to it and draws the new lock chip, the new day, the new tag or the
 * print that is no longer there.
 */
export function markPileStale(queryClient: QueryClient): void {
  PILE_QUERY_KEYS.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  });
}

/**
 * Asks for the item once more when the server refused a write.
 *
 * A `403` means the viewer's rights changed under the page, and a `404` means
 * the item went or was hidden; either way the page is showing controls the
 * server will not honour, and one honest refetch is how they agree again
 * (decision 12). It counts one open, which is rare and true.
 */
export function refetchItemWhenRefused(options: {
  queryClient: QueryClient;
  itemId: string;
  error: unknown;
}): void {
  const { error } = options;
  if (
    error instanceof ApiRequestError &&
    (error.status === 403 || error.status === 404)
  ) {
    void options.queryClient.refetchQueries({
      queryKey: itemQueryOptions(options.itemId).queryKey,
      exact: true,
    });
  }
}
```

- [ ] **Step 8: Implement `useItemDetailWrite.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { itemWriteFailure } from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeWriteScopeFromItemId,
  markPileStale,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/** What one call may hear back, after the cache has been written. */
export type WriteCallbacks = {
  onSuccess?: () => void;
  onError?: () => void;
};

/** What a sheet needs to draw one write: the call, its progress, its failure. */
export type ItemWrite<TVariables> = {
  save: (variables: TVariables, callbacks?: Readonly<WriteCallbacks>) => void;
  isSaving: boolean;
  /** Whatever went wrong, already in words. */
  error: string | undefined;
};

/**
 * A write that answers with the whole `ItemDetail`: the description, the
 * tags, the people, the visibility and the capture date.
 *
 * The answer replaces the cache entry, which is also how the composed alt
 * text follows a people change in the same response (`items.md`
 * § `PUT /api/items/:itemId/people`, transformation 4).
 */
export function useItemDetailWrite<TVariables>(options: {
  itemId: string;
  mutationFn: (variables: TVariables) => Promise<ItemDetail>;
}): ItemWrite<TVariables> {
  const queryClient = useQueryClient();
  const { itemId } = options;
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: options.mutationFn,
    onSuccess: (detail) => {
      queryClient.setQueryData(itemQueryOptions(itemId).queryKey, detail);
      markPileStale(queryClient);
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });

  return {
    save: (variables, callbacks) => {
      mutation.mutate(variables, {
        onSuccess: () => {
          callbacks?.onSuccess?.();
        },
        onError: () => {
          callbacks?.onError?.();
        },
      });
    },
    isSaving: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
```

- [ ] **Step 9: Implement `useItemEdits.ts`**

```ts
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ItemDetail,
  PersonInput,
  ResolveVisibilityRuleRequest,
  SetCaptureDateRequest,
} from "@memory-shoebox/shared";
import {
  itemQueryOptions,
  setItemAltText,
  setItemCaptureDate,
  setItemPeople,
  setItemTags,
  setItemVisibility,
} from "@/api/items/items";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite";

/** The tag set, replaced whole: names as typed. */
export function useSetItemTags(itemId: string): ItemWrite<string[]> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (tags: string[]) => {
      return setItemTags({ itemId, body: { tags } });
    },
  });
}

/** The people set, replaced whole: known people by id, new ones by name. */
export function useSetItemPeople(itemId: string): ItemWrite<PersonInput[]> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (people: PersonInput[]) => {
      return setItemPeople({ itemId, body: { people } });
    },
  });
}

/** The alt text override. Null clears it back to the composed line. */
export function useSetItemAltText(itemId: string): ItemWrite<string | null> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (altText: string | null) => {
      return setItemAltText({ itemId, body: { altText } });
    },
  });
}

/** The hand correction to the capture date. */
export function useSetItemCaptureDate(
  itemId: string,
): ItemWrite<SetCaptureDateRequest> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (body: SetCaptureDateRequest) => {
      return setItemCaptureDate({ itemId, body });
    },
  });
}

/**
 * Finds or creates the rule, then repoints the item at it, skipping the
 * repoint when the rule found is the one the item already has.
 *
 * Two round trips for one save is the contract's choice (`items.md`
 * § Visibility): choosing a rule is idempotent and shared, pointing an item
 * at one is neither.
 */
async function _repointItem(options: {
  queryClient: QueryClient;
  itemId: string;
  request: ResolveVisibilityRuleRequest;
}): Promise<ItemDetail> {
  const { queryClient, itemId } = options;
  const rule = await findOrCreateVisibilityRule(options.request);
  const current = queryClient.getQueryData(itemQueryOptions(itemId).queryKey);
  return current !== undefined &&
    current.visibility.visibilityRuleId === rule.visibilityRuleId
    ? current
    : setItemVisibility({
        itemId,
        body: { visibilityRuleId: rule.visibilityRuleId },
      });
}

/** Who can see it: a mode and subjects, found as a rule and pointed at. */
export function useSetItemVisibility(
  itemId: string,
): ItemWrite<ResolveVisibilityRuleRequest> {
  const queryClient = useQueryClient();
  return useItemDetailWrite({
    itemId,
    mutationFn: (request: ResolveVisibilityRuleRequest) => {
      return _repointItem({ queryClient, itemId, request });
    },
  });
}
```

- [ ] **Step 10: Implement `useConversation.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCommentRequest,
  ItemDetail,
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/api/comments/comments";
import { itemQueryOptions } from "@/api/items/items";
import {
  clearCommentReaction,
  clearItemReaction,
  setCommentReaction,
  setItemReaction,
} from "@/api/reactions/reactions";
import { makeSummaryFromChoice } from "@/system/Reactions/presentReactions";
import {
  commentSendFailure,
  itemWriteFailure,
  REACTION_FAILURE,
} from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeItemDetailFromCommentReactions,
  makeItemDetailFromDeletedComment,
  makeItemDetailFromItemReactions,
  makeItemDetailFromSavedComment,
} from "@/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/**
 * Comments and both reaction sets: the writes that answer with something
 * smaller than the whole item, which the cache updates in
 * `itemCacheUpdates.ts` fold back in.
 */

/** Rewrites the cached item, if there is one. */
function _useUpdateCachedItem(
  itemId: string,
): (update: (detail: ItemDetail) => ItemDetail) => void {
  const queryClient = useQueryClient();
  return (update) => {
    queryClient.setQueryData(itemQueryOptions(itemId).queryKey, (detail) => {
      return detail === undefined ? detail : update(detail);
    });
  };
}

/** What the composer needs. `onSent` clears it, and only on success. */
export type CommentSend = {
  send: (draft: CreateCommentRequest, onSent: () => void) => void;
  isSending: boolean;
  error: string | undefined;
};

/** Says something, and appends the answer to the thread. */
export function useCreateComment(itemId: string): CommentSend {
  const queryClient = useQueryClient();
  const updateCachedItem = _useUpdateCachedItem(itemId);
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: (draft: CreateCommentRequest) => {
      return createComment({ itemId, body: draft });
    },
    onSuccess: (comment) => {
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    send: (draft, onSent) => {
      mutation.mutate(draft, { onSuccess: onSent });
    },
    isSending: mutation.isPending,
    error:
      mutation.error === null ? undefined : commentSendFailure(mutation.error),
  };
}

/** Edits one comment's body, and puts the answer where it stood. */
export function useEditComment(options: {
  itemId: string;
  commentId: string;
}): {
  save: (body: string, onSaved: () => void) => void;
  isSaving: boolean;
  error: string | undefined;
} {
  const { itemId, commentId } = options;
  const queryClient = useQueryClient();
  const updateCachedItem = _useUpdateCachedItem(itemId);
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: (body: string) => {
      return updateComment({ commentId, body: { body } });
    },
    onSuccess: (comment) => {
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    save: (body, onSaved) => {
      mutation.mutate(body, { onSuccess: onSaved });
    },
    isSaving: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}

/** Takes one comment down, and out of the thread. */
export function useDeleteComment(options: {
  itemId: string;
  commentId: string;
}): { remove: () => void; error: string | undefined } {
  const { itemId, commentId } = options;
  const queryClient = useQueryClient();
  const updateCachedItem = _useUpdateCachedItem(itemId);
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return deleteComment(commentId);
    },
    onSuccess: () => {
      updateCachedItem((detail) => {
        return makeItemDetailFromDeletedComment({ detail, commentId });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    remove: () => {
      mutation.mutate();
    },
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}

/** What a reaction row needs. */
export type ReactionWrite = {
  react: (kind: ReactionKind | null) => void;
  error: string | undefined;
};

/** Where one reaction summary lives inside the item, and how to set it. */
type ReactionTarget = {
  itemId: string;
  viewer: MemberRef;
  getSummary: (detail: ItemDetail) => ReactionSummary | undefined;
  makeDetail: (detail: ItemDetail, reactions: ReactionSummary) => ItemDetail;
  mutationFn: (
    kind: ReactionKind | null,
  ) => Promise<ReactionSummary | undefined>;
};

/**
 * One reaction, written into the cache before the request goes, and put back
 * if it fails.
 *
 * The cache, rather than the control, carries the tap, because the cache is
 * what a failure can roll back: `Reactions` follows `myKind` whenever it
 * moves. A `204` for taking one off leaves the optimistic summary standing,
 * which is exactly the client removing its own row (`items.md` § Reactions).
 */
function _useReaction(target: Readonly<ReactionTarget>): ReactionWrite {
  const queryClient = useQueryClient();
  const updateCachedItem = _useUpdateCachedItem(target.itemId);
  const writeSummary = (reactions: ReactionSummary) => {
    updateCachedItem((detail) => {
      return target.makeDetail(detail, reactions);
    });
  };
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(target.itemId),
    mutationFn: target.mutationFn,
    onMutate: (kind) => {
      const detail = queryClient.getQueryData(
        itemQueryOptions(target.itemId).queryKey,
      );
      const previous =
        detail === undefined ? undefined : target.getSummary(detail);
      if (previous !== undefined) {
        writeSummary(
          makeSummaryFromChoice({
            reactions: previous,
            chosen: kind,
            viewer: target.viewer,
          }),
        );
      }
      return { previous };
    },
    onError: (error, _kind, context) => {
      if (context?.previous !== undefined) {
        writeSummary(context.previous);
      }
      refetchItemWhenRefused({ queryClient, itemId: target.itemId, error });
    },
    onSuccess: (summary) => {
      if (summary !== undefined) {
        writeSummary(summary);
      }
    },
  });
  return {
    react: (kind) => {
      mutation.mutate(kind);
    },
    error: mutation.error === null ? undefined : REACTION_FAILURE,
  };
}

/** The reaction on the photograph or the video itself. */
export function useItemReaction(options: {
  itemId: string;
  viewer: MemberRef;
}): ReactionWrite {
  const { itemId } = options;
  return _useReaction({
    itemId,
    viewer: options.viewer,
    getSummary: (detail) => {
      return detail.reactions;
    },
    makeDetail: (detail, reactions) => {
      return makeItemDetailFromItemReactions({ detail, reactions });
    },
    mutationFn: (kind) => {
      return kind === null
        ? clearItemReaction(itemId).then(() => {
            return undefined;
          })
        : setItemReaction({ itemId, kind });
    },
  });
}

/** The reaction on one comment. */
export function useCommentReaction(options: {
  itemId: string;
  commentId: string;
  viewer: MemberRef;
}): ReactionWrite {
  const { itemId, commentId } = options;
  return _useReaction({
    itemId,
    viewer: options.viewer,
    getSummary: (detail) => {
      return detail.comments.find((comment) => {
        return comment.commentId === commentId;
      })?.reactions;
    },
    makeDetail: (detail, reactions) => {
      return makeItemDetailFromCommentReactions({
        detail,
        commentId,
        reactions,
      });
    },
    mutationFn: (kind) => {
      return kind === null
        ? clearCommentReaction(commentId).then(() => {
            return undefined;
          })
        : setCommentReaction({ commentId, kind });
    },
  });
}
```

- [ ] **Step 11: Implement `useDeleteItem.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteItem } from "@/api/items/items";
import { itemWriteFailure } from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeWriteScopeFromItemId,
  markPileStale,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/**
 * The delete. Nothing blocks it (`items.md` § `DELETE /api/items/:itemId`).
 *
 * The item's own cache entry is left alone rather than removed: the page is
 * still mounted when the answer lands, and removing an observed query makes
 * it fetch again, which would flash "not here" before the way out is taken.
 * Going forward in history to it later refetches, and answers `404`, which is
 * the truth.
 */
export function useDeleteItem(itemId: string): {
  remove: (onDeleted: () => void) => void;
  isDeleting: boolean;
  error: string | undefined;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return deleteItem(itemId);
    },
    onSuccess: () => {
      markPileStale(queryClient);
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    remove: (onDeleted) => {
      mutation.mutate(undefined, { onSuccess: onDeleted });
    },
    isDeleting: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
```

- [ ] **Step 12: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/itemWrites && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/surfaces/Item/itemWrites
git commit -m "feat(web): the item's writes land in its cache, one scope, never a refetch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: The route, its four states, and the photograph

**Files:**

- Modify: `apps/web/src/routes/_app/items.$itemId.tsx`
- Modify: `apps/web/src/routes/rendering.test.tsx` (one line)
- Create: `apps/web/src/surfaces/Item/ItemSurface/ItemSurface.tsx`
- Create: `apps/web/src/surfaces/Item/ItemSurface/ItemNotHere.tsx`, `ItemLoading.tsx`, `ItemFailed.tsx`
- Create: `apps/web/src/surfaces/Item/ItemViewer/ItemViewer.tsx`, `ItemMediaColumn.tsx`, `useWayBack.ts`
- Create: `apps/web/src/surfaces/Item/PhotoFrame.tsx`, `apps/web/src/surfaces/Item/ItemMeta.tsx`
- Create: `apps/web/src/surfaces/Item/ItemSurface/__tests__/ItemSurface.states.test.tsx`

Decisions 1, 5 and 12.

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

/** How many times the page asked for one item, which is how many opens. */
function _opensOf(itemId: string): number {
  return recordedRequests().filter((line) => {
    return line === `GET /api/items/${itemId}`;
  }).length;
}

describe("the item page", () => {
  it("says not here for an address that is not an item's, and asks for nothing", async () => {
    respondWithItem(makeItemDetail());
    renderItem("abc");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This one is not here.",
      }),
    ).toBeVisible();
    expect(
      recordedRequests().some((line) => {
        return line.includes("/api/items/abc");
      }),
    ).toBe(false);
  });

  it("says not here, in the same words, when the server answers 404", async () => {
    respondWithItem(makeItemDetail());
    renderItem("018f0000-0000-7000-8000-00000000f999");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This one is not here.",
      }),
    ).toBeVisible();
  });

  it("says it did not open on a server fault, and asks again when told to", async () => {
    respondWithItem(makeItemDetail(), {
      [`GET /api/items/${ITEM_ID}`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    await waitFor(() => {
      expect(_opensOf(ITEM_ID)).toBe(2);
    });
  });

  it("draws the photograph full frame, with its composed alt text", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("img", {
        name: "Mateo, Papá and Mamá, 14 September 2026",
      }),
    ).toHaveAttribute("src", "https://example.invalid/display.jpg");
  });

  it("gives the page a heading a screen reader can land on", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "A photograph from 14 September 2026",
      }),
    ).toBeInTheDocument();
  });

  it("says when it was taken on the camera's own clock, and who put it up", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(await screen.findByText("14 September 2026, 6:41 am")).toBeVisible();
    expect(screen.getByText("Uploaded by Mamá")).toBeVisible();
  });

  it("goes back to the day it was taken when there is no history to go back through", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Back to 14 September" }),
    ).toHaveAttribute("href", "/?at=2026-09-14");
  });
});
```

In `apps/web/src/routes/rendering.test.tsx`, change `["/items/abc", "One item."],` to `["/items/abc", "This one is not here."],`. The top-bar test beside it already expects "Back to the pile", which `ItemNotHere` draws.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/ItemSurface src/routes/rendering.test.tsx`
Expected: FAIL, the route still renders the placeholder.

- [ ] **Step 3: Write the three states**

`ItemSurface/ItemNotHere.tsx`:

```tsx
import type { ReactNode } from "react";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import {
  NOT_HERE_HEADING,
  NOT_HERE_PROSE,
} from "@/surfaces/Item/itemCopy/itemCopy";

/**
 * An item the viewer cannot open, for whatever reason.
 *
 * One state for a deleted item, an item outside the viewer's visibility and
 * an address that was never an item's, in the same words, because the server
 * answers the first two with a byte-identical `404` and anything that told
 * them apart would be a way of finding out what exists.
 */
export function ItemNotHere(): ReactNode {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Lede>{NOT_HERE_HEADING}</Lede>
        <Prose onPanel>{NOT_HERE_PROSE}</Prose>
      </Page>
    </>
  );
}
```

`ItemSurface/ItemLoading.tsx`:

```tsx
import type { ReactNode } from "react";
import { TopBar } from "@/system/Chrome/TopBar";
import classes from "@/system/system.module.css";

/**
 * While the item is on its way.
 *
 * Quiet on purpose: the design spec draws no loading state and asks whoever
 * builds the surface to own one, and on one origin talking to one SQLite file
 * this lasts a few frames. The empty viewer keeps the page's shape so nothing
 * jumps when the photograph arrives.
 */
export function ItemLoading(): ReactNode {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <main className={classes.viewer} aria-busy="true">
        <h1 className="visually-hidden">Opening it</h1>
      </main>
    </>
  );
}
```

`ItemSurface/ItemFailed.tsx`:

```tsx
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

type Props = {
  onRetry: () => void;
};

/**
 * A server fault or a dropped call, as distinct from "not here".
 *
 * Trying again is a genuine second open, so it is a button somebody presses
 * rather than a timer.
 */
export function ItemFailed({ onRetry }: Readonly<Props>): ReactNode {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Lede>This one did not open.</Lede>
        <Prose onPanel>
          Something went wrong between here and the Shoebox. It is worth another
          try.
        </Prose>
        <ChipRow>
          <Button onClick={onRetry}>Try again</Button>
        </ChipRow>
      </Page>
    </>
  );
}
```

- [ ] **Step 4: Write `PhotoFrame.tsx` and `ItemMeta.tsx`**

`apps/web/src/surfaces/Item/PhotoFrame.tsx`:

```tsx
import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";

type Props = {
  media: MediaRef;
};

/**
 * A photograph full frame, never cropped, with the alt text the server
 * composed or the override somebody typed. It is never null
 * (`items.md` transformation 2), so there is nothing to fall back to here.
 */
export function PhotoFrame({ media }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.frame}>
      <img
        src={media.display.url}
        alt={media.altText}
        width={media.display.width}
        height={media.display.height}
      />
    </div>
  );
}
```

`apps/web/src/surfaces/Item/ItemMeta.tsx`:

```tsx
import { IconLock } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ICON_PROPS } from "@/system/icons";
import {
  captureMomentLabel,
  framePositionLabel,
  getWallClockFromCapture,
  runtimeLabel,
  visibilityLabel,
} from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/**
 * The line under the frame: when, which frame of the run or how long, who
 * put it up, and, for whoever may change it, who can see it.
 *
 * "Frame 7 of 45" reads `burstPosition` against `burst.visibleFrameCount`,
 * both counted over the visible siblings on the server, never against the
 * strip, which is capped.
 */
export function ItemMeta({ detail, timezone }: Readonly<Props>): ReactNode {
  const wallClock = getWallClockFromCapture({
    capturedAt: detail.capturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes,
    timezone,
  });
  return (
    <p className={classes.viewerMeta}>
      <span>{captureMomentLabel(wallClock)}</span>
      {detail.burst === null || detail.burstPosition === null ? null : (
        <span>
          {framePositionLabel({
            position: detail.burstPosition,
            count: detail.burst.visibleFrameCount,
          })}
        </span>
      )}
      {detail.kind === "video" && detail.media.durationMs !== null ? (
        <span>{runtimeLabel(detail.media.durationMs)}</span>
      ) : null}
      <span>{`Uploaded by ${detail.uploadedBy.displayName}`}</span>
      {detail.capabilities.canSetVisibility ? (
        <span>
          <IconLock {...ICON_PROPS} aria-hidden="true" />
          {visibilityLabel(detail.visibility)}
        </span>
      ) : null}
    </p>
  );
}
```

- [ ] **Step 5: Write `useWayBack.ts`, `ItemMediaColumn.tsx` and `ItemViewer.tsx`**

`ItemViewer/useWayBack.ts`:

```ts
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";

/** The way out of an item, and the two ways it is taken. */
export type WayBack = {
  /** For the back link: history when there is some, else the link's href. */
  onBackClick: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  /** For a delete: the same way out, taken without a press. */
  leave: () => void;
};

/**
 * The way back to the pile (decision 5).
 *
 * With history inside the app, Back is history, which lands on the pile with
 * its filter and its scroll offset exactly as they were. Arriving from a
 * pasted link or an email there is none, so the back link's own href takes
 * over, which is the day the item was taken.
 */
export function useWayBack(capturedOn: string): WayBack {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const navigate = useNavigate();
  return {
    onBackClick: canGoBack
      ? (event) => {
          event.preventDefault();
          router.history.back();
        }
      : undefined,
    leave: () => {
      if (canGoBack) {
        router.history.back();
        return;
      }
      void navigate({ to: "/", search: { at: capturedOn }, replace: true });
    },
  };
}
```

`ItemViewer/ItemMediaColumn.tsx`:

```tsx
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ItemMeta } from "@/surfaces/Item/ItemMeta";
import { PhotoFrame } from "@/surfaces/Item/PhotoFrame";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/** The left column: the frame, the line under it, and what follows it. */
export function ItemMediaColumn({
  detail,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      <PhotoFrame media={detail.media} />
      <ItemMeta detail={detail} timezone={timezone} />
    </div>
  );
}
```

`ItemViewer/ItemViewer.tsx`:

```tsx
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { TopBar } from "@/system/Chrome/TopBar";
import { dayMonthLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";
import { itemHeading } from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemMediaColumn } from "@/surfaces/Item/ItemViewer/ItemMediaColumn";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

type Props = {
  detail: ItemDetail;
  viewer: Viewer;
  timezone: string;
};

/**
 * Surfaces 3 and 4 once the item is in hand: `.viewer`, two columns, the
 * frame and its run on the left and the talk panel on the right, collapsing
 * to one column at 56rem (`design-spec.md` § Responsive behaviour).
 *
 * The heading is visually hidden: a sighted reader has the photograph, and a
 * screen reader needs somewhere to land that says what this page is.
 */
export function ItemViewer({ detail, timezone }: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(detail.capturedOn);
  return (
    <>
      <TopBar
        back={{
          label: `Back to ${dayMonthLabel(detail.capturedOn)}`,
          to: "/",
          search: { at: detail.capturedOn },
          onClick: wayBack.onBackClick,
        }}
      />
      <main className={classes.viewer}>
        <h1 className="visually-hidden">{itemHeading(detail)}</h1>
        <ItemMediaColumn detail={detail} timezone={timezone} />
      </main>
    </>
  );
}
```

(`viewer` is in `Props` already because every later task needs it; it is not destructured until Task 17 uses it.)

- [ ] **Step 6: Write `ItemSurface.tsx`**

```tsx
import { idSchema } from "@memory-shoebox/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApiRequestError } from "@/api/client/client";
import { itemQueryOptions } from "@/api/items/items";
import { ItemFailed } from "@/surfaces/Item/ItemSurface/ItemFailed";
import { ItemLoading } from "@/surfaces/Item/ItemSurface/ItemLoading";
import { ItemNotHere } from "@/surfaces/Item/ItemSurface/ItemNotHere";
import { ItemViewer } from "@/surfaces/Item/ItemViewer/ItemViewer";

type Props = {
  itemId: string;
};

/** Whether an answer means "not here": a 404, or a 400 for a malformed id. */
function _isNotHere(error: Error | null): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 404 || error.status === 400)
  );
}

/**
 * Surfaces 3 and 4, chosen between once the item has answered: a link cannot
 * know which kind it points at until then.
 *
 * **The fetch is here, never in a route loader** (decision 1): every run of
 * `itemQueryOptions` counts an open, and a loader would run when a pointer so
 * much as rested on a link. An address that is not a UUID is not asked about
 * at all, since the answer can only be "not here".
 *
 * While a sibling loads, the item before it stays drawn
 * (`placeholderData: keepPreviousData`), so the strip keeps keyboard focus
 * across the move (decision 5).
 */
export function ItemSurface({ itemId }: Readonly<Props>): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const isWellFormed = idSchema.safeParse(itemId).success;
  const query = useQuery({
    ...itemQueryOptions(itemId),
    enabled: isWellFormed,
    placeholderData: keepPreviousData,
  });

  if (!isWellFormed || _isNotHere(query.error)) {
    return <ItemNotHere />;
  }
  if (query.data === undefined) {
    return query.isError ? (
      <ItemFailed
        onRetry={() => {
          void query.refetch();
        }}
      />
    ) : (
      <ItemLoading />
    );
  }
  return (
    <ItemViewer
      detail={query.data}
      viewer={viewer}
      timezone={settings.timezone}
    />
  );
}
```

- [ ] **Step 7: Point the route at it**

Replace `apps/web/src/routes/_app/items.$itemId.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ItemSurface } from "@/surfaces/Item/ItemSurface/ItemSurface";

/*
 * **No loader, and do not add one.** `GET /api/items/:itemId` counts an open
 * every time it runs, and the router preloads a route's loader whenever a
 * pointer rests on a link to it (`defaultPreload: "intent"` in
 * `src/router.ts`). A loader here would count an open for every sibling in
 * the strip a mouse crossed. `ItemSurface` fetches with `useQuery` instead
 * (decision 1 of the step 6b design), and a test preloads a link to prove it.
 */
export const Route = createFileRoute("/_app/items/$itemId")({
  staticData: { hasOwnBar: true },
  component: ItemPage,
});

function ItemPage(): ReactNode {
  const { itemId } = Route.useParams();
  return <ItemSurface itemId={itemId} />;
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item src/routes && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean. (`routeTree.gen.ts` does not change: the route's path and file are the same.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes apps/web/src/surfaces/Item
git commit -m "feat(web): the item route opens a photograph, or says it is not here

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Reacting to the photograph

**Files:**

- Create: `apps/web/src/surfaces/Item/ItemReactions.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemMediaColumn.tsx`, `ItemViewer.tsx`
- Create: `apps/web/src/surfaces/Item/__tests__/ItemReactions.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ITEM_ID, makeItemDetail, SIGNED_IN } from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

/** Presses React on the photograph, then one of the six. */
async function _react(word: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^React$/ }));
  const picker = await screen.findByRole("dialog");
  await userEvent.click(within(picker).getByRole("button", { name: word }));
}

describe("reacting to the photograph", () => {
  it("sends the reaction and draws the server's answer", async () => {
    respondWithItem(makeItemDetail(), {
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        body: {
          kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
          myKind: "love",
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    await _react("Love");

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/items/${ITEM_ID}/reaction`,
      );
    });
    expect(screen.getByRole("button", { name: /^Love$/ })).toBeVisible();
    expect(screen.getByText(/Nobody is emailed about one/)).toBeVisible();
  });

  it("puts the reaction back, and says so, when it does not go through", async () => {
    respondWithItem(makeItemDetail(), {
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    await _react("Love");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That reaction did not go through",
    );
    expect(screen.getByRole("button", { name: /^React$/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/__tests__/ItemReactions.test.tsx`
Expected: FAIL, there is no React button.

- [ ] **Step 3: Write `ItemReactions.tsx`**

```tsx
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Reactions } from "@/system/Reactions/Reactions";
import { Prose } from "@/system/typography/Prose";
import { reactionHint } from "@/surfaces/Item/itemCopy/itemCopy";
import { useItemReaction } from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The reaction on the photograph or the video itself, between the frame's own
 * facts and the run it came from. One tap, each choice carrying its word
 * (`DESIGN.md` § Reactions), and never an email.
 */
export function ItemReactions({ detail, viewer }: Readonly<Props>): ReactNode {
  const { react, error } = useItemReaction({ itemId: detail.itemId, viewer });
  return (
    <>
      <Reactions
        onPanel
        reactions={detail.reactions}
        viewer={viewer}
        goesTo={reactionHint(detail.kind)}
        onReact={react}
      />
      {error === undefined ? null : (
        <Prose onPanel role="alert">
          {error}
        </Prose>
      )}
    </>
  );
}
```

- [ ] **Step 4: Put it in the left column**

`ItemMediaColumn.tsx` becomes:

```tsx
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";
import { ItemMeta } from "@/surfaces/Item/ItemMeta";
import { ItemReactions } from "@/surfaces/Item/ItemReactions";
import { PhotoFrame } from "@/surfaces/Item/PhotoFrame";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  timezone: string;
};

/** The left column: the frame, the line under it, the reaction, the run. */
export function ItemMediaColumn({
  detail,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      <PhotoFrame media={detail.media} />
      <ItemMeta detail={detail} timezone={timezone} />
      <div className={classes.frameReactions}>
        <ItemReactions detail={detail} viewer={viewer} />
      </div>
    </div>
  );
}
```

In `ItemViewer.tsx`, destructure `viewer` and pass it: `export function ItemViewer({ detail, viewer, timezone }: Readonly<Props>)` and `<ItemMediaColumn detail={detail} viewer={viewer} timezone={timezone} />`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): react to a photograph, and see it put back if it fails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: The burst strip

**Files:**

- Create: `apps/web/src/surfaces/Item/SiblingStrip/SiblingStrip.tsx`
- Create: `apps/web/src/surfaces/Item/SiblingStrip/SiblingLinks.tsx`
- Create: `apps/web/src/surfaces/Item/SiblingStrip/SiblingStrip.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemMediaColumn.tsx`
- Modify: `apps/web/src/system/system.module.css` (one selector)

Decision 6. **The strip latches nothing itself**: `GET /api/items/:itemId` already writes `first_seen_at` for every visible sibling (`apps/server/src/routes/items/readItemRoutes.ts`). What it must never do is ask for a sibling's permalink to draw itself, which would count forty-five opens; the latch test in Task 25 pins that.

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  BURST_ID,
  ITEM_ID,
  makeBurstDetail,
  makeBurstFrame,
  makeItemDetail,
} from "@/testing/itemFixtures";
import { renderItem, respondWithItem } from "@/testing/itemHarness";

describe("the burst strip", () => {
  it("keeps the run beside the frame, captioned with its span", async () => {
    const detail = makeBurstDetail({ position: 7, count: 45 });
    respondWithItem(detail);
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", {
      name: "45 frames over 3 minutes",
    });
    expect(within(strip).getAllByRole("link")).toHaveLength(45);
    expect(
      within(strip).getByRole("link", { name: "Frame 7 of 45" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText("Frame 7 of 45", { selector: "span" }),
    ).toBeVisible();
  });

  it("is one tab stop, and the arrow keys move along it", async () => {
    const detail = makeBurstDetail({ position: 7, count: 45 });
    respondWithItem(detail);
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /45 frames/ });
    const current = within(strip).getByRole("link", { name: "Frame 7 of 45" });
    expect(current).toHaveAttribute("tabindex", "0");
    expect(
      within(strip).getByRole("link", { name: "Frame 8 of 45" }),
    ).toHaveAttribute("tabindex", "-1");

    current.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(
      within(strip).getByRole("link", { name: "Frame 8 of 45" }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(
      within(strip).getByRole("link", { name: "Frame 45 of 45" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      within(strip).getByRole("link", { name: "Frame 1 of 45" }),
    ).toHaveFocus();
  });

  it("opens a sibling in place of this one, rather than on top of it", async () => {
    const detail = makeBurstDetail({ position: 7 });
    const sibling = makeBurstDetail({ position: 8 });
    respondWithItem(detail, {
      [`GET /api/items/${sibling.itemId}`]: { body: sibling, status: 200 },
    });
    const { router } = renderItem(detail.itemId);

    await userEvent.click(
      await screen.findByRole("link", { name: "Frame 8 of 45" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${sibling.itemId}`);
    });
    expect(router.history.length).toBe(1);
  });

  it("asks the frames route for the whole run when it is longer than the strip", async () => {
    const detail = makeBurstDetail({ position: 61, count: 75 });
    respondWithItem(detail, {
      [`GET /api/bursts/${BURST_ID}/frames`]: {
        body: {
          frames: Array.from({ length: 75 }, (_unused, index) => {
            return makeBurstFrame(index + 1);
          }),
          nextCursor: null,
        },
        status: 200,
      },
    });
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /75 frames/ });
    await waitFor(() => {
      expect(within(strip).getAllByRole("link")).toHaveLength(75);
    });
    expect(
      within(strip).getByRole("link", { name: "Frame 61 of 75" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("draws no strip for a photograph outside a burst", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    await screen.findByText("Uploaded by Mamá");
    expect(screen.queryByRole("navigation", { name: /frames/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/SiblingStrip`
Expected: FAIL, there is no strip.

- [ ] **Step 3: Write `SiblingLinks.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import type { KeyboardEvent, ReactNode } from "react";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { framePositionLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  frames: readonly BurstFrameRef[];
  currentItemId: string;
  count: number;
};

/** Which link a key moves to, as an index, or undefined for any other key. */
function _getIndexFromKey(options: {
  key: string;
  index: number;
  last: number;
}): number | undefined {
  const indexByKey: Record<string, number> = {
    ArrowRight: options.index + 1,
    ArrowLeft: options.index - 1,
    Home: 0,
    End: options.last,
  };
  const target = indexByKey[options.key];
  return target === undefined
    ? undefined
    : Math.min(Math.max(target, 0), options.last);
}

/** Moves focus along the strip when the key is one of the strip's. */
function _moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const links = [...event.currentTarget.querySelectorAll("a")];
  const index = links.findIndex((link) => {
    return link === document.activeElement;
  });
  const target = _getIndexFromKey({
    key: event.key,
    index,
    last: links.length - 1,
  });
  if (target !== undefined) {
    event.preventDefault();
    links[target]?.focus();
  }
}

/**
 * The frames, as one tab stop with the arrows moving along it.
 *
 * Forty-five links would be forty-five tab stops between the frame and the
 * comments, so only the open frame takes Tab and the arrow keys, Home and End
 * move between the rest; Enter opens one. Each image is decorative, because
 * forty-five readings of the same composed sentence help nobody: the link's
 * name is its position. The router marks the open one `aria-current="page"`.
 *
 * A move replaces the history entry, so Back leaves the burst rather than
 * stepping back through it.
 */
export function SiblingLinks({
  frames,
  currentItemId,
  count,
}: Readonly<Props>): ReactNode {
  const hasCurrent = frames.some((frame) => {
    return frame.itemId === currentItemId;
  });
  const tabStopId = hasCurrent ? currentItemId : frames[0]?.itemId;
  return (
    <div className={classes.siblings} onKeyDown={_moveFocus}>
      {frames.map((frame) => {
        return (
          <Link
            key={frame.itemId}
            to="/items/$itemId"
            params={{ itemId: frame.itemId }}
            replace
            className={classes.sibling}
            tabIndex={frame.itemId === tabStopId ? 0 : -1}
            aria-label={framePositionLabel({ position: frame.position, count })}
          >
            <img
              src={frame.thumb.url}
              alt=""
              width={frame.thumb.width}
              height={frame.thumb.height}
              loading="lazy"
            />
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write `SiblingStrip.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { burstSpanLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { SiblingLinks } from "@/surfaces/Item/SiblingStrip/SiblingLinks";

type Props = {
  detail: ItemDetail;
};

/**
 * The burst this frame came out of, kept beside it, because in a pile you are
 * always somewhere inside a run.
 *
 * The run is `burstFrames`, which the server caps at sixty. When the burst is
 * longer, the strip asks the frames route for the whole of it instead, which
 * is also what brings in the open frame when it sits past sixty. Either way
 * nothing here requests a sibling's permalink: that would be an open, and a
 * thumbnail is not one. The server latched `first_seen_at` for every visible
 * sibling when this item opened (decision 6).
 */
export function SiblingStrip({ detail }: Readonly<Props>): ReactNode {
  const burst = detail.burst;
  const needsWholeRun =
    burst !== null && burst.visibleFrameCount > detail.burstFrames.length;
  const wholeRun = useQuery({
    ...burstFramesQueryOptions(burst?.burstId ?? ""),
    enabled: needsWholeRun,
  });

  if (burst === null) {
    return null;
  }
  const caption = burstSpanLabel(burst);
  return (
    <nav aria-label={caption}>
      <LabelText>{caption}</LabelText>
      <SiblingLinks
        frames={wholeRun.data?.frames ?? detail.burstFrames}
        currentItemId={detail.itemId}
        count={burst.visibleFrameCount}
      />
    </nav>
  );
}
```

- [ ] **Step 5: Put it under the reaction, and mark the open frame however the router spells it**

In `ItemMediaColumn.tsx`, import `SiblingStrip` and add it after the reactions `div`:

```tsx
<SiblingStrip detail={detail} />
```

In `system.module.css`, change `.sibling[aria-current="true"] {` to `.sibling[aria-current] {`: TanStack Router's `Link` writes `aria-current="page"` on the link to the page you are on, and the strip's open frame is exactly that link.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/surfaces/Item apps/web/src/system/system.module.css
git commit -m "feat(web): the burst strip beside the frame, one tab stop with arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: The thread

**Files:**

- Create: `apps/web/src/surfaces/Item/ItemTalk/ItemTalk.tsx`
- Create: `apps/web/src/surfaces/Item/ItemTalk/ItemComment.tsx`
- Create: `apps/web/src/surfaces/Item/ItemTalk/ItemTalk.test.tsx`
- Create: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemViewer.tsx`

The quiet state is the composer as the surface (`design-spec.md` § Looking at a day, where it fails).

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const MINE = makeComment({
  author: SIGNED_IN,
  body: "He has his mother's chin.",
  canEdit: true,
  canDelete: true,
});

describe("the thread", () => {
  it("makes the composer the surface when nothing has been said", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    expect(
      within(talk).getByRole("heading", { name: "Nothing said yet" }),
    ).toBeVisible();
    expect(
      within(talk).getByText(/Anybody who can see it can be the first/),
    ).toBeVisible();
    expect(
      within(talk).getByRole("textbox", { name: "Say something" }),
    ).toBeVisible();
    expect(
      within(talk).getByText("Everyone who can see this one can read it."),
    ).toBeVisible();
  });

  it("adds a comment to the thread without asking for the item again", async () => {
    respondWithItem(makeItemDetail(), {
      [`POST /api/items/${ITEM_ID}/comments`]: { body: MINE, status: 201 },
    });
    renderItem(ITEM_ID);

    const field = await screen.findByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("He has his mother's chin.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "1 comment" })).toBeVisible();
    expect(field).toHaveValue("");
    expect(
      recordedRequests().filter((line) => {
        return line === `GET /api/items/${ITEM_ID}`;
      }),
    ).toHaveLength(1);
  });

  it("keeps the words, and says how long to wait, when the send is refused", async () => {
    respondWithItem(makeItemDetail(), {
      [`POST /api/items/${ITEM_ID}/comments`]: {
        body: {
          error: "rate_limited",
          message: "x",
          details: { retryAfterSeconds: 30 },
        },
        status: 429,
      },
    });
    renderItem(ITEM_ID);

    const field = await screen.findByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "Again!");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait 30 seconds",
    );
    expect(field).toHaveValue("Again!");
  });

  it("edits your own comment, and says it was edited", async () => {
    respondWithItem(makeItemDetail({ comments: [MINE] }), {
      [`PATCH /api/comments/${MINE.commentId}`]: {
        body: {
          ...MINE,
          body: "His father's chin, then.",
          editedAt: "2026-09-14T06:00:00.000Z",
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "What you wrote" });
    await userEvent.clear(field);
    await userEvent.type(field, "His father's chin, then.");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the change" }),
    );

    expect(await screen.findByText(/His father's chin, then\./)).toBeVisible();
    expect(screen.getByText(/^edited /)).toBeVisible();
  });

  it("takes a deleted comment out of the thread", async () => {
    respondWithItem(makeItemDetail({ comments: [MINE] }), {
      [`DELETE /api/comments/${MINE.commentId}`]: {
        body: undefined,
        status: 204,
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("He has his mother's chin.")).toBeNull();
    });
    expect(
      screen.getByRole("heading", { name: "Nothing said yet" }),
    ).toBeVisible();
  });

  it("sends a reaction on a comment to the comment's own route", async () => {
    const theirs = makeComment();
    respondWithItem(makeItemDetail({ comments: [theirs] }), {
      [`PUT /api/comments/${theirs.commentId}/reaction`]: {
        body: {
          kinds: [{ kind: "care", count: 1, members: [SIGNED_IN] }],
          myKind: "care",
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    await userEvent.click(
      within(talk).getByRole("button", { name: /^React$/ }),
    );
    const picker = await screen.findByRole("dialog");
    await userEvent.click(within(picker).getByRole("button", { name: "Care" }));

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/comments/${theirs.commentId}/reaction`,
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/ItemTalk`
Expected: FAIL, there is no thread.

- [ ] **Step 3: Write `ItemComment.tsx`**

```tsx
import type { ReactNode } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { CommentRow } from "@/system/Talk/CommentRow";
import {
  useCommentReaction,
  useDeleteComment,
  useEditComment,
} from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  itemId: string;
  comment: CommentDto;
  viewer: MemberRef;
  onSeek?: (seconds: number) => void;
};

/**
 * One comment, with its three writes. Each comment holds its own, so one
 * comment saving does not grey out another's Edit.
 */
export function ItemComment({
  itemId,
  comment,
  viewer,
  onSeek,
}: Readonly<Props>): ReactNode {
  const { commentId } = comment;
  const edit = useEditComment({ itemId, commentId });
  const removal = useDeleteComment({ itemId, commentId });
  const reaction = useCommentReaction({ itemId, commentId, viewer });
  return (
    <CommentRow
      comment={comment}
      viewer={viewer}
      onSeek={onSeek}
      onSaveEdit={edit.save}
      isSaving={edit.isSaving}
      onDelete={removal.remove}
      onReact={reaction.react}
      error={edit.error ?? removal.error ?? reaction.error}
    />
  );
}
```

- [ ] **Step 4: Write `ItemTalk.tsx`**

```tsx
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Composer } from "@/system/Talk/Composer";
import { Talk } from "@/system/Talk/Talk";
import { Prose } from "@/system/typography/Prose";
import {
  COMPOSER_HINT,
  commentsHeading,
  quietThreadProse,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemComment } from "@/surfaces/Item/ItemTalk/ItemComment";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The thread and its composer.
 *
 * With nothing said, the composer is the surface rather than an afterthought
 * under an empty list: the panel says plainly that anybody who can see it can
 * be the first, and the field is right there.
 */
export function ItemTalk({ detail, viewer }: Readonly<Props>): ReactNode {
  const { send, isSending, error } = useCreateComment(detail.itemId);
  return (
    <Talk heading={commentsHeading(detail)}>
      {detail.comments.length === 0 ? (
        <Prose>{quietThreadProse(detail.kind)}</Prose>
      ) : (
        detail.comments.map((comment) => {
          return (
            <ItemComment
              key={comment.commentId}
              itemId={detail.itemId}
              comment={comment}
              viewer={viewer}
            />
          );
        })
      )}
      <Composer
        goesTo={COMPOSER_HINT}
        isSending={isSending}
        error={error}
        onSend={(body, onSent) => {
          send({ body, atSeconds: null }, onSent);
        }}
      />
    </Talk>
  );
}
```

- [ ] **Step 5: Write `ItemSheets.tsx` and put the right column on the page**

`ItemViewer/ItemSheets.tsx`:

```tsx
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ItemTalk } from "@/surfaces/Item/ItemTalk/ItemTalk";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The right column: the thread, then the sheets this viewer's capabilities
 * allow. Every sheet is drawn from `detail.capabilities` and nothing else
 * (decision 4), never from a role.
 */
export function ItemSheets({ detail, viewer }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <ItemTalk detail={detail} viewer={viewer} />
    </Stack>
  );
}
```

In `ItemViewer.tsx`, import `ItemSheets` and add it after `ItemMediaColumn` inside `<main>`:

```tsx
<ItemSheets key={detail.itemId} detail={detail} viewer={viewer} />
```

The `key` is decision 5's other half: the right column's local state (a half-typed comment, an open editor) belongs to one item, so it remounts when the item changes. The left column is not keyed, which is what keeps the strip's focus across a move.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): the thread on one item, live, with the composer as its quiet state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: Who and what is in it

**Files:**

- Create: `apps/web/src/surfaces/Item/InThisOne/InThisOne.tsx`, `PeopleRow.tsx`, `PeopleEditor.tsx`, `TagsRow.tsx`, `TagsEditor.tsx`
- Create: `apps/web/src/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames.ts` and its test
- Create: `apps/web/src/surfaces/Item/InThisOne/InThisOne.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`

Decision 9. Every add or remove sends a `PUT` of the whole set and nothing is pressed.

- [ ] **Step 1: Write the failing tests**

`makePeopleInputsFromNames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";

const MATEO = {
  personId: "018f0000-0000-7000-8000-00000000e101",
  displayName: "Mateo",
};
const SOFIA = {
  personId: "018f0000-0000-7000-8000-00000000e102",
  displayName: "Sofía",
};

describe("makePeopleInputsFromNames", () => {
  it("sends a known person by id and a new one by name", () => {
    expect(
      makePeopleInputsFromNames({
        names: ["Mateo", "Bisabuela Elena"],
        known: [MATEO, SOFIA],
      }),
    ).toEqual([
      { personId: MATEO.personId },
      { displayName: "Bisabuela Elena" },
    ]);
  });

  it("keeps the person a name already had on the item", () => {
    const otherMateo = {
      ...MATEO,
      personId: "018f0000-0000-7000-8000-00000000e199",
    };
    expect(
      makePeopleInputsFromNames({
        names: ["Mateo"],
        known: [MATEO, otherMateo],
      }),
    ).toEqual([{ personId: MATEO.personId }]);
  });
});
```

`InThisOne.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_MATEO_ID,
  TAG_HOSPITAL_ID,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const SOFIA_ID = "018f0000-0000-7000-8000-00000000e102";

const DIRECTORY = {
  people: [
    {
      person: { personId: SOFIA_ID, displayName: "Sofía" },
      itemCount: 3,
      firstCapturedOn: "2026-09-01",
      lastCapturedOn: "2026-09-20",
      face: null,
    },
  ],
  nextCursor: null,
  peopleCount: 1,
};

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

describe("who and what is in it", () => {
  it("links each person and tag to the pile filtered by them", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(await screen.findByRole("link", { name: "Mateo" })).toHaveAttribute(
      "href",
      `/?person=${PERSON_MATEO_ID}`,
    );
    expect(screen.getByRole("link", { name: "hospital" })).toHaveAttribute(
      "href",
      `/?tag=${TAG_HOSPITAL_ID}`,
    );
    expect(screen.getByText(/never says who may open it/)).toBeVisible();
  });

  it("offers no editor to somebody the server says cannot", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    await screen.findByRole("link", { name: "Mateo" });
    expect(screen.queryByRole("button", { name: "+ Tag somebody" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add a tag" })).toBeNull();
  });

  it("tags somebody new by name, and the alt text follows in the same answer", async () => {
    const answer = makeItemDetail({
      capabilities: OTHER_UPLOADER_CAPABILITIES,
      people: [
        { personId: PERSON_MATEO_ID, displayName: "Mateo" },
        {
          personId: "018f0000-0000-7000-8000-00000000e103",
          displayName: "Bisabuela Elena",
        },
      ],
      media: {
        ...EDITABLE.media,
        altText: "Mateo and Bisabuela Elena, 14 September 2026",
      },
    });
    respondWithItem(EDITABLE, {
      "GET /api/people": { body: DIRECTORY, status: 200 },
      [`PUT /api/items/${ITEM_ID}/people`]: { body: answer, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    await userEvent.type(
      screen.getByLabelText("Who is in it"),
      "Bisabuela Elena{enter}",
    );

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/people`)).toEqual({
        people: [
          { personId: PERSON_MATEO_ID },
          { displayName: "Bisabuela Elena" },
        ],
      });
    });
    expect(
      await screen.findByRole("img", {
        name: "Mateo and Bisabuela Elena, 14 September 2026",
      }),
    ).toBeVisible();
  });

  it("tags somebody the archive knows by id", async () => {
    respondWithItem(EDITABLE, {
      "GET /api/people": { body: DIRECTORY, status: 200 },
      [`PUT /api/items/${ITEM_ID}/people`]: { body: EDITABLE, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    // Typed in two halves, so the name only lands once the directory has: the
    // option appearing is what says the archive knows her.
    const field = screen.getByLabelText("Who is in it");
    await userEvent.type(field, "Sof");
    await screen.findByRole("option", { name: /Sofía/ });
    await userEvent.type(field, "ía{enter}");

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/people`)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: SOFIA_ID }],
      });
    });
  });

  it("puts the people back, and says so, when the save fails", async () => {
    respondWithItem(EDITABLE, {
      [`PUT /api/items/${ITEM_ID}/people`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    await userEvent.type(
      screen.getByLabelText("Who is in it"),
      "Bisabuela Elena{enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not go through",
    );
    await waitFor(() => {
      expect(screen.queryByText("Bisabuela Elena")).toBeNull();
    });
  });

  it("replaces the tag set as a tag is added", async () => {
    respondWithItem(EDITABLE, {
      [`PUT /api/items/${ITEM_ID}/tags`]: { body: EDITABLE, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(screen.getByLabelText("Tags"), "beach{enter}");

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/tags`)).toEqual({
        tags: ["hospital", "beach"],
      });
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/InThisOne`
Expected: FAIL, nothing of this exists.

- [ ] **Step 3: Write `makePeopleInputsFromNames.ts`**

```ts
import type { PersonInput, PersonRef } from "@memory-shoebox/shared";

/**
 * The people set to send, from the names in the field.
 *
 * The field holds names, because it accepts one the archive has never heard
 * of. A name a known person carries goes as their id, so tagging "Mateo"
 * attaches the Mateo on 412 photographs rather than inventing a second one;
 * any other name goes as a name, and the server makes a person of it. The
 * first person carrying a name wins, and the caller lists the item's own
 * people first, so a name already on the item keeps the person it had.
 */
export function makePeopleInputsFromNames(options: {
  names: readonly string[];
  known: readonly PersonRef[];
}): PersonInput[] {
  return options.names.map((name) => {
    const person = options.known.find((candidate) => {
      return candidate.displayName === name;
    });
    return person === undefined
      ? { displayName: name }
      : { personId: person.personId };
  });
}
```

- [ ] **Step 4: Write `PeopleEditor.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { peopleQueryOptions } from "@/api/vocabularies/vocabularies";
import { ChipRow } from "@/system/Chip/ChipRow";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import { Prose } from "@/system/typography/Prose";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";
import { useSetItemPeople } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/** The names on the item now, which is what the field starts from. */
function _namesOf(detail: ItemDetail): string[] {
  return detail.people.map((person) => {
    return person.displayName;
  });
}

/**
 * Tagging people, which saves as it changes.
 *
 * A failed save resets the field to the server's set rather than leaving a
 * pill the server never accepted.
 */
export function PeopleEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const directory = useQuery(peopleQueryOptions(undefined));
  const write = useSetItemPeople(detail.itemId);
  const [names, setNames] = useState(() => {
    return _namesOf(detail);
  });
  const directoryPeople = directory.data?.people ?? [];

  return (
    <Stack gap="sm">
      <PeopleField
        label="Who is in it"
        description="Start typing. Press Enter on a name the archive has never heard of to add it."
        placeholder="Mateo, Abuela Rosa"
        mode="anyone"
        members={[]}
        people={directoryPeople.map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        value={names}
        onChange={(nextNames) => {
          if (nextNames.length > LIMITS.itemMaxPeople) {
            return;
          }
          setNames([...nextNames]);
          write.save(
            makePeopleInputsFromNames({
              names: nextNames,
              known: [
                ...detail.people,
                ...directoryPeople.map((entry) => {
                  return entry.person;
                }),
              ],
            }),
            {
              onError: () => {
                setNames(_namesOf(detail));
              },
            },
          );
        }}
      />
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button variant="default" onClick={onDone}>
          Done
        </Button>
      </ChipRow>
    </Stack>
  );
}
```

- [ ] **Step 5: Write `TagsEditor.tsx`**

```tsx
import { Button, Stack, TagsInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { tagsQueryOptions } from "@/api/vocabularies/vocabularies";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/** The tag names on the item now. */
function _tagNamesOf(detail: ItemDetail): string[] {
  return detail.tags.map((tag) => {
    return tag.name;
  });
}

/**
 * Tagging, which saves as it changes. Free text, suggested from the tags the
 * archive already has; the server keeps an existing tag's own spelling, so
 * typing "hospital" never renames "Hospital" under the other items.
 */
export function TagsEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const vocabulary = useQuery(tagsQueryOptions(undefined));
  const write = useSetItemTags(detail.itemId);
  const [names, setNames] = useState(() => {
    return _tagNamesOf(detail);
  });

  return (
    <Stack gap="sm">
      <TagsInput
        label="Tags"
        description="Anything you would look for it by later. Press Enter after each one."
        placeholder="beach, first steps"
        data={(vocabulary.data?.tags ?? []).map((entry) => {
          return entry.tag.name;
        })}
        value={names}
        maxTags={LIMITS.itemMaxTags}
        splitChars={[","]}
        onChange={(nextNames) => {
          setNames(nextNames);
          write.save(nextNames, {
            onError: () => {
              setNames(_tagNamesOf(detail));
            },
          });
        }}
      />
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button variant="default" onClick={onDone}>
          Done
        </Button>
      </ChipRow>
    </Stack>
  );
}
```

- [ ] **Step 6: Write `PeopleRow.tsx`, `TagsRow.tsx` and `InThisOne.tsx`**

`PeopleRow.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Chip } from "@/system/Chip/Chip";
import { ChipLink } from "@/system/Chip/ChipLink";
import { ChipRow } from "@/system/Chip/ChipRow";
import { PeopleEditor } from "@/surfaces/Item/InThisOne/PeopleEditor";

type Props = {
  detail: ItemDetail;
};

/**
 * Who is in it: each person a link into the pile filtered by them, and for an
 * uploader a way to tag somebody, members and non-members alike.
 */
export function PeopleRow({ detail }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <PeopleEditor
        detail={detail}
        onDone={() => {
          return setIsEditing(false);
        }}
      />
    );
  }
  return (
    <ChipRow>
      {detail.people.map((person) => {
        return (
          <ChipLink
            key={person.personId}
            to="/"
            search={{ person: person.personId }}
          >
            {person.displayName}
          </ChipLink>
        );
      })}
      {detail.capabilities.canEditPeople ? (
        <Chip
          onClick={() => {
            return setIsEditing(true);
          }}
        >
          + Tag somebody
        </Chip>
      ) : null}
    </ChipRow>
  );
}
```

`TagsRow.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Chip } from "@/system/Chip/Chip";
import { ChipLink } from "@/system/Chip/ChipLink";
import { ChipRow } from "@/system/Chip/ChipRow";
import { TagsEditor } from "@/surfaces/Item/InThisOne/TagsEditor";

type Props = {
  detail: ItemDetail;
};

/** The tags: each a link into the pile filtered by it, and an editor. */
export function TagsRow({ detail }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <TagsEditor
        detail={detail}
        onDone={() => {
          return setIsEditing(false);
        }}
      />
    );
  }
  return (
    <ChipRow>
      {detail.tags.map((tag) => {
        return (
          <ChipLink key={tag.tagId} to="/" search={{ tag: tag.tagId }}>
            {tag.name}
          </ChipLink>
        );
      })}
      {detail.capabilities.canEditTags ? (
        <Chip
          onClick={() => {
            return setIsEditing(true);
          }}
        >
          + Add a tag
        </Chip>
      ) : null}
    </ChipRow>
  );
}
```

`InThisOne.tsx`:

```tsx
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { PeopleRow } from "@/surfaces/Item/InThisOne/PeopleRow";
import { TagsRow } from "@/surfaces/Item/InThisOne/TagsRow";
import { peopleTagProse } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
};

/**
 * Who and what is in it. A tag on a person grants them nothing, and the
 * sheet says so in a sentence rather than leaving anybody to wonder.
 */
export function InThisOne({ detail }: Readonly<Props>): ReactNode {
  return (
    <Sheet label="What is in this one">
      <LabelText component="h2">In this one</LabelText>
      <Stack gap="sm" mt="sm">
        <PeopleRow detail={detail} />
        <TagsRow detail={detail} />
        <Prose>{peopleTagProse(detail.kind)}</Prose>
      </Stack>
    </Sheet>
  );
}
```

- [ ] **Step 7: Add the sheet**

In `ItemSheets.tsx`, import `InThisOne` and put `<InThisOne detail={detail} />` after `<ItemTalk ... />`.

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean. If `search={{ person: person.personId }}` does not type-check against `LinkProps["search"]`, use `search={{ person: [person.personId] }}` instead and update the two `href` expectations to TanStack's serialisation of an array (`/?person=%5B%22<id>%22%5D`); the route's `_oneOrMany` accepts both.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): who and what is in it, linked into the pile and saved as it changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: Who can see it

**Files:**

- Create: `apps/web/src/surfaces/Item/WhoCanSee/WhoCanSee.tsx`, `VisibilityEditor.tsx`
- Create: `apps/web/src/surfaces/Item/WhoCanSee/visibilityChoice/visibilityChoice.ts` and its test
- Create: `apps/web/src/surfaces/Item/WhoCanSee/WhoCanSee.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`

Decision 8.

- [ ] **Step 1: Write the failing tests**

`visibilityChoice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import {
  isSameVisibility,
  makePickerOptionsFromSources,
  makeResolveRequestFromChoice,
} from "@/surfaces/Item/WhoCanSee/visibilityChoice/visibilityChoice";
import { SIGNED_IN } from "@/testing/itemFixtures";

const TIA = {
  memberId: "018f0000-0000-7000-8000-00000000c003",
  displayName: "Tía Marisol",
};
const COUSINS_ID = "018f0000-0000-7000-8000-0000000a0002";

const ONLY_TIA_AND_COUSINS: VisibilitySummary = {
  visibilityRuleId: "018f0000-0000-7000-8000-0000000a0101",
  mode: "only",
  label: null,
  subjects: [
    { kind: "member", id: TIA.memberId, displayName: TIA.displayName },
    { kind: "group", id: COUSINS_ID, displayName: "Cousins" },
  ],
};

describe("makePickerOptionsFromSources", () => {
  it("offers what the rule already names, and the viewer, with no lists at all", () => {
    expect(
      makePickerOptionsFromSources({
        members: undefined,
        groups: undefined,
        visibility: ONLY_TIA_AND_COUSINS,
        viewer: SIGNED_IN,
      }),
    ).toEqual({
      members: [TIA, SIGNED_IN],
      groups: [{ groupId: COUSINS_ID, name: "Cousins" }],
    });
  });

  it("prefers the fetched rows, which know a role and a size", () => {
    const options = makePickerOptionsFromSources({
      members: {
        shape: "admin",
        members: [{ ...TIA, role: "viewer" }],
        nextCursor: null,
      },
      groups: {
        shape: "admin",
        groups: [
          { groupId: COUSINS_ID, name: "Cousins", members: [TIA, SIGNED_IN] },
        ],
        nextCursor: null,
      },
      visibility: ONLY_TIA_AND_COUSINS,
      viewer: SIGNED_IN,
    });
    expect(options.members[0]).toEqual({ ...TIA, role: "viewer" });
    expect(options.groups).toEqual([
      { groupId: COUSINS_ID, name: "Cousins", memberCount: 2 },
    ]);
  });
});

describe("isSameVisibility", () => {
  it("ignores the order the subjects were chosen in", () => {
    expect(
      isSameVisibility({
        visibility: ONLY_TIA_AND_COUSINS,
        mode: "only",
        subjectIds: [COUSINS_ID, TIA.memberId],
      }),
    ).toBe(true);
  });

  it("reads Except with nobody named as Everyone, as the server does", () => {
    const everyone: VisibilitySummary = {
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    };
    expect(
      isSameVisibility({
        visibility: everyone,
        mode: "except",
        subjectIds: [],
      }),
    ).toBe(true);
    expect(
      isSameVisibility({
        visibility: everyone,
        mode: "except",
        subjectIds: [TIA.memberId],
      }),
    ).toBe(false);
  });
});

describe("makeResolveRequestFromChoice", () => {
  it("names each subject's kind from the groups it knows", () => {
    expect(
      makeResolveRequestFromChoice({
        mode: "except",
        subjectIds: [TIA.memberId, COUSINS_ID],
        groups: [{ groupId: COUSINS_ID, name: "Cousins" }],
      }),
    ).toEqual({
      mode: "except",
      subjects: [
        { kind: "member", id: TIA.memberId },
        { kind: "group", id: COUSINS_ID },
      ],
    });
  });

  it("sends Everyone with no subjects, whatever the field still holds", () => {
    expect(
      makeResolveRequestFromChoice({
        mode: "everyone",
        subjectIds: [TIA.memberId],
        groups: [],
      }),
    ).toEqual({ mode: "everyone", subjects: [] });
  });
});
```

`WhoCanSee.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import {
  ITEM_ID,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const RULE_ID = "018f0000-0000-7000-8000-0000000a0201";

const JUST_ME: VisibilitySummary = {
  visibilityRuleId: RULE_ID,
  mode: "only",
  label: "Just me",
  subjects: [
    {
      kind: "member",
      id: SIGNED_IN.memberId,
      displayName: SIGNED_IN.displayName,
    },
  ],
};

const MINE = makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES });

/** The sheet, once the page has drawn it. */
async function _sheet() {
  return screen.findByRole("region", { name: "Who can see this" });
}

describe("who can see it", () => {
  it("says who can see it, in words, to the item's own uploader", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    expect(within(sheet).getByText("Everyone")).toBeVisible();
    expect(
      within(sheet).getByText("Everybody in the Shoebox can open it."),
    ).toBeVisible();
  });

  it("saves nothing when nothing changed", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    ).toBeVisible();
    expect(recordedRequests()).not.toContain(
      "POST /api/visibility-rules/resolve",
    );
  });

  it("finds the rule, then points the item at it", async () => {
    respondWithItem(MINE, {
      "POST /api/visibility-rules/resolve": {
        body: { visibilityRuleId: RULE_ID, visibility: JUST_ME },
        status: 200,
      },
      [`PATCH /api/items/${ITEM_ID}/visibility`]: {
        body: { ...MINE, visibility: JUST_ME },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
    await userEvent.click(within(sheet).getByLabelText("Only these"));
    await userEvent.click(await screen.findByRole("option", { name: /Papá/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await within(sheet).findByText("Just me")).toBeVisible();
    expect(recordedBodyOf("POST /api/visibility-rules/resolve")).toEqual({
      mode: "only",
      subjects: [{ kind: "member", id: SIGNED_IN.memberId }],
    });
    expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}/visibility`)).toEqual({
      visibilityRuleId: RULE_ID,
    });
  });

  it("does not repoint the item at the rule it already has", async () => {
    respondWithItem(MINE, {
      "POST /api/visibility-rules/resolve": {
        body: {
          visibilityRuleId: "visibility-rule-everyone",
          visibility: MINE.visibility,
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
    await userEvent.click(within(sheet).getByLabelText("Only these"));
    await userEvent.click(await screen.findByRole("option", { name: /Papá/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        "POST /api/visibility-rules/resolve",
      );
    });
    expect(recordedRequests()).not.toContain(
      `PATCH /api/items/${ITEM_ID}/visibility`,
    );
  });

  it("will not save Only with nobody named", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));

    expect(within(sheet).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(sheet).getByText("Name somebody first, or choose Everyone."),
    ).toBeVisible();
  });

  it("offers the people the rule already names while the member list is not there", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OWN_UPLOADER_CAPABILITIES,
        visibility: {
          visibilityRuleId: RULE_ID,
          mode: "only",
          label: null,
          subjects: [
            {
              kind: "member",
              id: "018f0000-0000-7000-8000-00000000c003",
              displayName: "Tía Marisol",
            },
          ],
        },
      }),
    );
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );

    expect(within(sheet).getByText("Tía Marisol")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/WhoCanSee`
Expected: FAIL, nothing of this exists.

- [ ] **Step 3: Write `visibilityChoice.ts`**

```ts
import type {
  MemberRef,
  ResolveVisibilityRuleRequest,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import type { GroupsResponse } from "@/api/groups/groups";
import type { MembersResponse } from "@/api/members/members";
import type {
  PeopleFieldGroup,
  PeopleFieldMember,
} from "@/system/PeopleField/PeopleField";
import type { VisibilityMode } from "@/system/VisibilityControl/VisibilityControl";

/** Everything the visibility picker can offer. */
export type PickerOptions = {
  members: PeopleFieldMember[];
  groups: PeopleFieldGroup[];
};

/** The first of each id, in order. */
function _uniqueBy<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

/** The fetched groups, sized where the admin shape lets them be. */
function _groupsFrom(groups: GroupsResponse | undefined): PeopleFieldGroup[] {
  if (groups === undefined) {
    return [];
  }
  return groups.shape === "admin"
    ? groups.groups.map((group) => {
        return {
          groupId: group.groupId,
          name: group.name,
          memberCount: group.members.length,
        };
      })
    : groups.groups.map((group) => {
        return { groupId: group.groupId, name: group.name };
      });
}

/**
 * Who the picker offers: the fetched lists, then the item's own subjects, then
 * the viewer, the first of each id winning.
 *
 * The fetched rows go first because they know more (a role, a size). The
 * rule's subjects carry their names, so a rule can always be edited down even
 * while `GET /api/members` and `GET /api/groups` answer `404` before step 8a
 * (decision 8); the viewer is there so "Only me" always works.
 */
export function makePickerOptionsFromSources(options: {
  members: MembersResponse | undefined;
  groups: GroupsResponse | undefined;
  visibility: VisibilitySummary;
  viewer: MemberRef;
}): PickerOptions {
  const { visibility, viewer } = options;
  const namedMembers = visibility.subjects
    .filter((subject) => {
      return subject.kind === "member";
    })
    .map((subject) => {
      return { memberId: subject.id, displayName: subject.displayName };
    });
  const namedGroups = visibility.subjects
    .filter((subject) => {
      return subject.kind === "group";
    })
    .map((subject) => {
      return { groupId: subject.id, name: subject.displayName };
    });
  return {
    members: _uniqueBy<PeopleFieldMember>(
      [
        ...(options.members?.members ?? []),
        ...namedMembers,
        { memberId: viewer.memberId, displayName: viewer.displayName },
      ],
      (member) => {
        return member.memberId;
      },
    ),
    groups: _uniqueBy(
      [..._groupsFrom(options.groups), ...namedGroups],
      (group) => {
        return group.groupId;
      },
    ),
  };
}

/** One rule as a comparable string, Except-with-nobody read as Everyone. */
function _canonicalRule(options: {
  mode: VisibilityMode;
  subjectIds: readonly string[];
}): string {
  const { mode, subjectIds } = options;
  return mode === "everyone" || (mode === "except" && subjectIds.length === 0)
    ? "everyone"
    : `${mode}:${[...subjectIds].sort().join(",")}`;
}

/**
 * Whether a choice is the rule the item already has, so Save can close with
 * no request at all. "Except nobody" is the seeded everyone rule on the
 * server (`items.md` § `POST /api/visibility-rules/resolve`, step 4), so it
 * is here too.
 */
export function isSameVisibility(options: {
  visibility: VisibilitySummary;
  mode: VisibilityMode;
  subjectIds: readonly string[];
}): boolean {
  return (
    _canonicalRule({ mode: options.mode, subjectIds: options.subjectIds }) ===
    _canonicalRule({
      mode: options.visibility.mode,
      subjectIds: options.visibility.subjects.map((subject) => {
        return subject.id;
      }),
    })
  );
}

/** The resolve request for a choice, each subject's kind read off the groups. */
export function makeResolveRequestFromChoice(options: {
  mode: VisibilityMode;
  subjectIds: readonly string[];
  groups: readonly PeopleFieldGroup[];
}): ResolveVisibilityRuleRequest {
  if (options.mode === "everyone") {
    return { mode: "everyone", subjects: [] };
  }
  const groupIds = new Set(
    options.groups.map((group) => {
      return group.groupId;
    }),
  );
  return {
    mode: options.mode,
    subjects: options.subjectIds.map((id) => {
      return { kind: groupIds.has(id) ? "group" : "member", id };
    }),
  };
}
```

- [ ] **Step 4: Write `VisibilityEditor.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { groupsQueryOptions } from "@/api/groups/groups";
import { membersQueryOptions } from "@/api/members/members";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import {
  VisibilityControl,
  type VisibilityMode,
} from "@/system/VisibilityControl/VisibilityControl";
import { kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { useSetItemVisibility } from "@/surfaces/Item/itemWrites/useItemEdits";
import {
  isSameVisibility,
  makePickerOptionsFromSources,
  makeResolveRequestFromChoice,
} from "@/surfaces/Item/WhoCanSee/visibilityChoice/visibilityChoice";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  onDone: () => void;
};

/**
 * Changing who can see it: the control pre-filled from the rule the item has,
 * a Save that asks nothing when nothing changed, and a Cancel.
 *
 * The member and group lists are fetched only once this is open, which is the
 * only place they are needed.
 */
export function VisibilityEditor({
  detail,
  viewer,
  onDone,
}: Readonly<Props>): ReactNode {
  const members = useQuery(membersQueryOptions());
  const groups = useQuery(groupsQueryOptions());
  const write = useSetItemVisibility(detail.itemId);
  const [mode, setMode] = useState<VisibilityMode>(detail.visibility.mode);
  const [subjectIds, setSubjectIds] = useState<readonly string[]>(() => {
    return detail.visibility.subjects.map((subject) => {
      return subject.id;
    });
  });
  const options = makePickerOptionsFromSources({
    members: members.data,
    groups: groups.data,
    visibility: detail.visibility,
    viewer,
  });
  const isUnfinished = mode === "only" && subjectIds.length === 0;

  return (
    <Stack gap="md">
      <VisibilityControl
        heading={`Who can see this ${kindNoun(detail.kind)}`}
        mode={mode}
        onModeChange={setMode}
        subjects={subjectIds}
        onSubjectsChange={setSubjectIds}
        members={options.members}
        groups={options.groups}
      />
      {isUnfinished ? (
        <Prose>Name somebody first, or choose Everyone.</Prose>
      ) : null}
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button
          disabled={isUnfinished || write.isSaving}
          onClick={() => {
            if (
              isSameVisibility({
                visibility: detail.visibility,
                mode,
                subjectIds,
              })
            ) {
              onDone();
              return;
            }
            write.save(
              makeResolveRequestFromChoice({
                mode,
                subjectIds,
                groups: options.groups,
              }),
              { onSuccess: onDone },
            );
          }}
        >
          {write.isSaving ? "Saving" : "Save"}
        </Button>
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
      </ChipRow>
    </Stack>
  );
}
```

- [ ] **Step 5: Write `WhoCanSee.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { visibilityLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";
import { visibilityProse } from "@/surfaces/Item/itemCopy/itemCopy";
import { VisibilityEditor } from "@/surfaces/Item/WhoCanSee/VisibilityEditor";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * Who can see it, for whoever put it there or runs the archive: the rule in
 * words, and a way to change it. The caller draws this only when
 * `capabilities.canSetVisibility` says so.
 */
export function WhoCanSee({ detail, viewer }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <Sheet label="Who can see this">
      {isEditing ? (
        <VisibilityEditor
          detail={detail}
          viewer={viewer}
          onDone={() => {
            return setIsEditing(false);
          }}
        />
      ) : (
        <Stack gap="sm">
          <LabelText component="h2">Who can see this</LabelText>
          <p className={classes.title}>{visibilityLabel(detail.visibility)}</p>
          <Prose>
            {visibilityProse({
              kind: detail.kind,
              mode: detail.visibility.mode,
            })}
          </Prose>
          <ChipRow>
            <Button
              variant="default"
              onClick={() => {
                return setIsEditing(true);
              }}
            >
              Change who can see it
            </Button>
          </ChipRow>
        </Stack>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 6: Add the sheet**

In `ItemSheets.tsx`, after `<InThisOne detail={detail} />`:

```tsx
{
  detail.capabilities.canSetVisibility ? (
    <WhoCanSee detail={detail} viewer={viewer} />
  ) : null;
}
```

- [ ] **Step 7: Run to verify they pass**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): who can see it, for its own uploader, found and repointed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 22: When it was taken

**Files:**

- Create: `apps/web/src/surfaces/Item/WhenTaken/WhenTaken.tsx`, `CaptureDateEditor.tsx`, `DateMoveWarnings.tsx`
- Create: `apps/web/src/surfaces/Item/WhenTaken/WhenTaken.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`, `ItemViewer.tsx`

Decision 10.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeBurstDetail,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const MINE = makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES });

/** Opens the correction. */
async function _openTheCorrection() {
  const sheet = await screen.findByRole("region", {
    name: "When this was taken",
  });
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Put the date right" }),
  );
  return sheet;
}

/** Picks a day in the date picker. */
async function _pickDay(label: string): Promise<void> {
  await userEvent.click(screen.getByLabelText("The day it was taken"));
  await userEvent.click(await screen.findByRole("button", { name: label }));
}

describe("when it was taken", () => {
  it("says when, and where that came from", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await screen.findByRole("region", {
      name: "When this was taken",
    });
    expect(within(sheet).getByText("14 September 2026, 6:41 am")).toBeVisible();
    expect(
      within(sheet).getByText(/^Read off the file itself\./),
    ).toBeVisible();
  });

  it("says what the file said before anything is put right", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    expect(within(sheet).getByText(/The file said/)).toHaveTextContent(
      "The file said 14 September 2026, 6:41 am.",
    );
  });

  it("warns before moving a frame out of its burst and outside its milestone", async () => {
    respondWithItem(
      makeBurstDetail(
        { position: 7, count: 45 },
        {
          capabilities: OWN_UPLOADER_CAPABILITIES,
          milestones: [
            {
              milestoneId: "018f0000-0000-7000-8000-00000000d201",
              name: "Mateo is here",
              startsOn: "2026-09-14",
              endsOn: "2026-09-14",
              blurb: null,
              spanContainsCapturedOn: true,
              mismatchAcknowledgedAt: null,
            },
          ],
        },
      ),
    );
    renderItem("018f0000-0000-7000-8000-0000000f0007");

    await _openTheCorrection();
    await _pickDay("15 September 2026");

    expect(screen.getByText(/takes it out of its burst/)).toBeVisible();
    expect(screen.getByText(/The other 44 stay where they are/)).toBeVisible();
    expect(screen.getByText("Mateo is here")).toBeVisible();
  });

  it("keeps the clock time by sending only the day", async () => {
    respondWithItem(MINE, {
      [`POST /api/items/${ITEM_ID}/capture-date`]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    await _pickDay("15 September 2026");
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/capture-date`)).toEqual(
        {
          capturedOn: "2026-09-15",
        },
      );
    });
  });

  it("sends the time only when it was changed", async () => {
    respondWithItem(MINE, {
      [`POST /api/items/${ITEM_ID}/capture-date`]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    fireEvent.change(screen.getByLabelText("The time"), {
      target: { value: "07:15" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/capture-date`)).toEqual(
        {
          capturedOn: "2026-09-14",
          capturedTime: "07:15",
        },
      );
    });
  });

  it("asks nothing when nothing was changed", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Put it right" }),
    );

    expect(
      within(sheet).getByRole("button", { name: "Put the date right" }),
    ).toBeVisible();
    expect(recordedRequests()).not.toContain(
      `POST /api/items/${ITEM_ID}/capture-date`,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/WhenTaken`
Expected: FAIL, there is no such sheet.

- [ ] **Step 3: Write `DateMoveWarnings.tsx`**

```tsx
import { IconAlertCircle } from "@tabler/icons-react";
import { Fragment, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { dayMonthLabel } from "@/system/labelHelpers/labelHelpers";
import { burstLeavingProse } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
  /** The day the field holds now, `YYYY-MM-DD`. */
  day: string;
};

/**
 * What moving it to another day will break, said before it breaks it: the
 * burst it leaves, and each attached milestone whose span would no longer
 * contain it. Nothing is detached; "it stays attached" is the truth, because
 * the offer to reconcile belongs to step 8b (decision 11).
 */
export function DateMoveWarnings({ detail, day }: Readonly<Props>): ReactNode {
  if (day === detail.capturedOn) {
    return null;
  }
  const outside = detail.milestones.filter((milestone) => {
    return day < milestone.startsOn || day > milestone.endsOn;
  });
  if (detail.burst === null && outside.length === 0) {
    return null;
  }
  return (
    <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
      {detail.burst === null ? null : (
        <>
          <b>{`Moving it off ${dayMonthLabel(detail.capturedOn)} takes it out of its burst.`}</b>{" "}
          {burstLeavingProse(detail.burst.visibleFrameCount)}
        </>
      )}
      {outside.map((milestone) => {
        return (
          <Fragment key={milestone.milestoneId}>
            {" "}
            It also falls outside <b>{milestone.name}</b>, and stays attached to
            it.
          </Fragment>
        );
      })}
    </Banner>
  );
}
```

- [ ] **Step 4: Write `CaptureDateEditor.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import {
  captureMomentLabel,
  getWallClockFromCapture,
  type WallClock,
} from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import { useSetItemCaptureDate } from "@/surfaces/Item/itemWrites/useItemEdits";
import { DateMoveWarnings } from "@/surfaces/Item/WhenTaken/DateMoveWarnings";

type Props = {
  detail: ItemDetail;
  timezone: string;
  /** The capture's wall clock now. */
  wallClock: WallClock;
  onDone: () => void;
};

/**
 * Putting the date right: the one edit that destroys something the file said,
 * so it names what the file said and what the move will break before it does
 * anything.
 *
 * The time is sent only when it changed, so the server keeps the clock time
 * the file carried, seconds and all, and invents nothing (`items.md`
 * § The capture date, step 2).
 */
export function CaptureDateEditor({
  detail,
  timezone,
  wallClock,
  onDone,
}: Readonly<Props>): ReactNode {
  const write = useSetItemCaptureDate(detail.itemId);
  const [day, setDay] = useState(detail.capturedOn);
  const [time, setTime] = useState(wallClock.time);
  const original = getWallClockFromCapture({
    capturedAt: detail.originalCapturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes,
    timezone,
  });
  const today = getWallClockFromCapture({
    capturedAt: new Date().toISOString(),
    offsetMinutes: null,
    timezone,
  }).date;
  const isUnchanged = day === detail.capturedOn && time === wallClock.time;

  return (
    <Stack gap="md">
      <Prose>
        The file said <b>{captureMomentLabel(original)}</b>. If that is wrong,
        put it right: the date is what decides which day this sits on and which
        milestone it falls inside.
      </Prose>
      <DatePickerInput
        label="The day it was taken"
        value={day}
        maxDate={today}
        leftSection={<IconCalendar {...ICON_PROPS} />}
        onChange={(nextDay) => {
          if (nextDay !== null) {
            setDay(nextDay);
          }
        }}
      />
      <TimeInput
        label="The time"
        description="Leave it if only the day was wrong."
        value={time}
        onChange={(event) => {
          return setTime(event.currentTarget.value);
        }}
      />
      <DateMoveWarnings detail={detail} day={day} />
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button
          disabled={write.isSaving || time === ""}
          onClick={() => {
            if (isUnchanged) {
              onDone();
              return;
            }
            write.save(
              time === wallClock.time
                ? { capturedOn: day }
                : { capturedOn: day, capturedTime: time },
              { onSuccess: onDone },
            );
          }}
        >
          {write.isSaving ? "Putting it right" : "Put it right"}
        </Button>
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
      </ChipRow>
      <Prose>
        Whatever the file originally said is kept, so this is always undoable,
        however many times the date is moved.
      </Prose>
    </Stack>
  );
}
```

- [ ] **Step 5: Write `WhenTaken.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import {
  captureMomentLabel,
  getWallClockFromCapture,
} from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";
import { captureSourceProse } from "@/surfaces/Item/itemCopy/itemCopy";
import { CaptureDateEditor } from "@/surfaces/Item/WhenTaken/CaptureDateEditor";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/**
 * When it was taken, for whoever put it there or runs the archive. The caller
 * draws this only when `capabilities.canFixCaptureDate` says so: the
 * correction belongs to the item's uploader, not to any uploader.
 */
export function WhenTaken({ detail, timezone }: Readonly<Props>): ReactNode {
  const [isFixing, setIsFixing] = useState(false);
  const wallClock = getWallClockFromCapture({
    capturedAt: detail.capturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes,
    timezone,
  });
  return (
    <Sheet label="When this was taken">
      <Stack gap="sm">
        <LabelText component="h2">When this was taken</LabelText>
        {isFixing ? (
          <CaptureDateEditor
            detail={detail}
            timezone={timezone}
            wallClock={wallClock}
            onDone={() => {
              return setIsFixing(false);
            }}
          />
        ) : (
          <>
            <p className={classes.title}>{captureMomentLabel(wallClock)}</p>
            <Prose>
              {captureSourceProse({
                kind: detail.kind,
                captureSource: detail.captureSource,
              })}
            </Prose>
            <ChipRow>
              <Button
                variant="default"
                leftSection={<IconCalendar {...ICON_PROPS} />}
                onClick={() => {
                  return setIsFixing(true);
                }}
              >
                Put the date right
              </Button>
            </ChipRow>
          </>
        )}
      </Stack>
    </Sheet>
  );
}
```

- [ ] **Step 6: Add the sheet**

`ItemSheets` needs the timezone now. Add `timezone: string;` to its `Props`, destructure it, and after the visibility sheet:

```tsx
{
  detail.capabilities.canFixCaptureDate ? (
    <WhenTaken detail={detail} timezone={timezone} />
  ) : null;
}
```

In `ItemViewer.tsx`, pass it: `<ItemSheets key={detail.itemId} detail={detail} viewer={viewer} timezone={timezone} />`.

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean. If the day button's name differs from "15 September 2026" in this Mantine version, read it from `screen.debug()` of the open picker and use that; Mantine 9 labels a day with `dayjs(date).format("D MMMM YYYY")` (`@mantine/dates/esm/components/Month/Month.mjs`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): put the date right, saying first what the move will break

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: Describing it

**Files:**

- Create: `apps/web/src/surfaces/Item/Describing/Describing.tsx`
- Create: `apps/web/src/surfaces/Item/Describing/Describing.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

/** The sheet and its field. */
async function _field() {
  const sheet = await screen.findByRole("region", { name: "Describing it" });
  return {
    sheet,
    field: within(sheet).getByRole("textbox", {
      name: "Describe this photograph",
    }),
  };
}

describe("describing it", () => {
  it("starts empty while there is no override, and quotes what is read out instead", async () => {
    respondWithItem(EDITABLE);
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    expect(field).toHaveValue("");
    expect(
      within(sheet).getByText(/“Mateo, Papá and Mamá, 14 September 2026”/),
    ).toBeVisible();
  });

  it("starts from the override, never from the generated line", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        altTextOverride: "Papá in scrubs holding Mateo",
        media: { ...EDITABLE.media, altText: "Papá in scrubs holding Mateo" },
      }),
    );
    renderItem(ITEM_ID);

    const { field } = await _field();
    expect(field).toHaveValue("Papá in scrubs holding Mateo");
  });

  it("saves a description, and the photograph reads it out", async () => {
    respondWithItem(EDITABLE, {
      [`PATCH /api/items/${ITEM_ID}`]: {
        body: makeItemDetail({
          capabilities: OTHER_UPLOADER_CAPABILITIES,
          altTextOverride: "Papá in scrubs holding Mateo",
          media: { ...EDITABLE.media, altText: "Papá in scrubs holding Mateo" },
        }),
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    expect(
      within(sheet).getByRole("button", { name: "Save the description" }),
    ).toBeDisabled();
    await userEvent.type(field, "Papá in scrubs holding Mateo");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save the description" }),
    );

    expect(
      await screen.findByRole("img", { name: "Papá in scrubs holding Mateo" }),
    ).toBeVisible();
    expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}`)).toEqual({
      altText: "Papá in scrubs holding Mateo",
    });
  });

  it("clears the override back to the generated line with a null", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        altTextOverride: "Papá in scrubs",
      }),
      { [`PATCH /api/items/${ITEM_ID}`]: { body: EDITABLE, status: 200 } },
    );
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    await userEvent.clear(field);
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save the description" }),
    );

    await waitFor(() => {
      expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}`)).toEqual({
        altText: null,
      });
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/Describing`
Expected: FAIL.

- [ ] **Step 3: Write `Describing.tsx`**

```tsx
import { Button, Stack, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { describeProse, kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { useSetItemAltText } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
};

/**
 * For somebody listening: the alt text override.
 *
 * **Pre-filled from `altTextOverride` and never from `media.altText`.** The
 * second is the composed line whenever no override exists, and saving it back
 * would turn an honest default into a typed override nobody wrote (Decision
 * 9). It saves on a button, because a sentence somebody is writing is not
 * finished on every keystroke.
 */
export function Describing({ detail }: Readonly<Props>): ReactNode {
  const write = useSetItemAltText(detail.itemId);
  const saved = detail.altTextOverride ?? "";
  const [draft, setDraft] = useState(saved);
  return (
    <Sheet label="Describing it">
      <Stack gap="sm">
        <LabelText component="h2">For somebody listening</LabelText>
        <Textarea
          label={`Describe this ${kindNoun(detail.kind)}`}
          description="Optional. Read aloud by a screen reader instead of the line below."
          placeholder="Papá in scrubs holding Mateo, minutes old"
          value={draft}
          autosize
          minRows={2}
          maxLength={LIMITS.altTextMaxLength}
          onChange={(event) => {
            return setDraft(event.currentTarget.value);
          }}
        />
        <Prose>
          {describeProse({
            draft,
            generated:
              detail.altTextOverride === null
                ? detail.media.altText
                : undefined,
          })}
        </Prose>
        {write.error === undefined ? null : (
          <Prose role="alert">{write.error}</Prose>
        )}
        <ChipRow>
          <Button
            disabled={draft.trim() === saved.trim() || write.isSaving}
            onClick={() => {
              write.save(draft.trim() === "" ? null : draft.trim());
            }}
          >
            {write.isSaving ? "Saving" : "Save the description"}
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
```

- [ ] **Step 4: Add the sheet**

In `ItemSheets.tsx`, after the capture date sheet:

```tsx
{
  detail.capabilities.canDescribe ? <Describing detail={detail} /> : null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): describe it for somebody listening, from the override only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: Download, ask for it to come down, delete

**Files:**

- Create: `apps/web/src/surfaces/Item/ItemActions/ItemActions.tsx`, `RemovalAsk.tsx`, `DeleteItemModal.tsx`
- Create: `apps/web/src/surfaces/Item/ItemActions/ItemActions.test.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemSheets.tsx`, `ItemViewer.tsx`

The removal ask is only the entry point: surface 10 behind it is step 8b's.

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  VIEWER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

describe("the actions", () => {
  it("offers the original to everybody, through the route that signs it", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Download the original" }),
    ).toHaveAttribute("href", `/api/items/${ITEM_ID}/original`);
  });

  it("offers somebody tagged in it the way to ask for it to come down", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: { ...VIEWER_CAPABILITIES, canRequestRemoval: true },
      }),
    );
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Ask for this to come down" }),
    ).toHaveAttribute("href", `/items/${ITEM_ID}/removal`);
    expect(
      screen.getByText(
        /Asking tells Mamá, who put it up, and everyone who runs the archive\./,
      ),
    ).toBeVisible();
  });

  it("deletes after saying what goes with it, then goes back to its day", async () => {
    const comments = ["d101", "d102", "d103"].map((suffix) => {
      return makeComment({
        commentId: `018f0000-0000-7000-8000-00000000${suffix}`,
      });
    });
    respondWithItem(
      makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES, comments }),
      { [`DELETE /api/items/${ITEM_ID}`]: { body: undefined, status: 204 } },
    );
    const { router } = renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete this photograph" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete this photograph?",
    });
    expect(
      within(dialog).getByText(/the 3 comments on it go with it/),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete it" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(router.state.location.search).toEqual({ at: "2026-09-14" });
    expect(recordedRequests()).toContain(`DELETE /api/items/${ITEM_ID}`);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/ItemActions`
Expected: FAIL.

- [ ] **Step 3: Write `RemovalAsk.tsx`**

```tsx
import { Button } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { removalAskProse } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
};

/**
 * The one thing a viewer can do about somebody else's photograph they are in:
 * ask for it to come down. A link to surface 10, which step 8b builds; the
 * caller draws this only when `capabilities.canRequestRemoval` says so.
 */
export function RemovalAsk({ detail }: Readonly<Props>): ReactNode {
  return (
    <>
      <ChipRow>
        <Button
          variant="default"
          leftSection={<IconFlag {...ICON_PROPS} />}
          renderRoot={(props) => {
            return (
              <Link
                {...props}
                to="/items/$itemId/removal"
                params={{ itemId: detail.itemId }}
              />
            );
          }}
        >
          Ask for this to come down
        </Button>
      </ChipRow>
      <Prose>{removalAskProse(detail.uploadedBy.displayName)}</Prose>
    </>
  );
}
```

- [ ] **Step 4: Write `DeleteItemModal.tsx`**

```tsx
import { Button, Modal, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { deleteItemProse, kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { useDeleteItem } from "@/surfaces/Item/itemWrites/useDeleteItem";

type Props = {
  detail: ItemDetail;
  opened: boolean;
  onClose: () => void;
  /** The way out, taken once the server has destroyed it. */
  onDeleted: () => void;
};

/**
 * Says what is destroyed and what goes with it, then destroys it. Not a hidden
 * flag: the record and the file both go.
 */
export function DeleteItemModal({
  detail,
  opened,
  onClose,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const removal = useDeleteItem(detail.itemId);
  const noun = kindNoun(detail.kind);
  return (
    <Modal opened={opened} onClose={onClose} title={`Delete this ${noun}?`}>
      <Stack gap="md">
        <Prose>
          {deleteItemProse({ commentCount: detail.comments.length })}
        </Prose>
        <Banner icon={<IconTrash {...ICON_PROPS} />}>
          This is not a hidden flag. A family member who asks for a {noun} to
          come down expects it to be gone, so it is gone.
        </Banner>
        {removal.error === undefined ? null : (
          <Prose role="alert">{removal.error}</Prose>
        )}
        <ChipRow>
          <Button
            variant="danger"
            disabled={removal.isDeleting}
            onClick={() => {
              removal.remove(onDeleted);
            }}
          >
            {removal.isDeleting ? "Deleting" : "Delete it"}
          </Button>
          <Button variant="default" onClick={onClose}>
            Keep it
          </Button>
        </ChipRow>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 5: Write `ItemActions.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { IconDownload, IconTrash } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { makeOriginalHrefFromItemId } from "@/api/items/items";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { DeleteItemModal } from "@/surfaces/Item/ItemActions/DeleteItemModal";
import { RemovalAsk } from "@/surfaces/Item/ItemActions/RemovalAsk";
import { deleteReasonProse, kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  onDeleted: () => void;
};

/**
 * Download the original, for everybody; the removal ask, for somebody tagged
 * in somebody else's photograph; and delete, for its uploader or an admin.
 * Each drawn exactly when `capabilities` says so, and an admin tagged in
 * somebody else's photograph can be offered both of the last two.
 */
export function ItemActions({
  detail,
  viewer,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const [isDeleting, setIsDeleting] = useState(false);
  const { capabilities } = detail;
  return (
    <Sheet label="Actions">
      <Stack gap="sm">
        <ChipRow>
          <Button
            component="a"
            href={makeOriginalHrefFromItemId(detail.itemId)}
            download
            variant="default"
            leftSection={<IconDownload {...ICON_PROPS} />}
          >
            Download the original
          </Button>
        </ChipRow>
        {capabilities.canRequestRemoval ? <RemovalAsk detail={detail} /> : null}
        {capabilities.canDelete ? (
          <>
            <ChipRow>
              <Button
                variant="danger"
                leftSection={<IconTrash {...ICON_PROPS} />}
                onClick={() => {
                  return setIsDeleting(true);
                }}
              >
                {`Delete this ${kindNoun(detail.kind)}`}
              </Button>
            </ChipRow>
            <Prose>
              {deleteReasonProse({
                isUploader: viewer.memberId === detail.uploadedBy.memberId,
              })}
            </Prose>
            <DeleteItemModal
              detail={detail}
              opened={isDeleting}
              onClose={() => {
                return setIsDeleting(false);
              }}
              onDeleted={onDeleted}
            />
          </>
        ) : null}
      </Stack>
    </Sheet>
  );
}
```

- [ ] **Step 6: Add the sheet, with the way out**

`ItemSheets` gets `onDeleted: () => void;` in `Props`, destructures it, and ends its `Stack` with:

```tsx
<ItemActions detail={detail} viewer={viewer} onDeleted={onDeleted} />
```

In `ItemViewer.tsx`, pass `onDeleted={wayBack.leave}` to `ItemSheets`.

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean. If `renderRoot`'s `props` do not spread into `Link` under the type-check, type it as `(props: Record<string, unknown>)` and spread; it carries `className`, `children` and the Mantine data attributes and nothing else.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): download, the removal ask, and delete, each as the server allows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: The video, and a comment pinned to a moment

**Files:**

- Create: `apps/web/src/surfaces/Item/ItemViewer/useVideoTransport.ts`
- Create: `apps/web/src/surfaces/Item/PinningSheet.tsx`
- Create: `apps/web/src/surfaces/Item/makeMarksFromComments.ts`
- Modify: `apps/web/src/surfaces/Item/ItemViewer/ItemViewer.tsx`, `ItemMediaColumn.tsx`, `ItemSheets.tsx`
- Modify: `apps/web/src/surfaces/Item/ItemTalk/ItemTalk.tsx`
- Create: `apps/web/src/surfaces/Item/__tests__/ItemVideo.test.tsx`

Decision 7, and surface 4's `paused`, `playing`, `pinning` and `quiet`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const PINNED = makeComment({ atSeconds: 11 });

beforeEach(() => {
  // jsdom implements no playback, and says so on the console when asked.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The transport's slider. */
async function _slider() {
  return screen.findByRole("slider", { name: "Where in the video" });
}

describe("one video", () => {
  it("stands on its transport, with its runtime and no strip", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    expect(await _slider()).toHaveAttribute("aria-valuetext", "0:00 of 0:22");
    expect(screen.getByText("0:22", { selector: "span" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: /frames/ })).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A video from 14 September 2026",
      }),
    ).toBeInTheDocument();
  });

  it("puts each pinned comment on the scrubber, from the contract's duration", async () => {
    respondWithItem(makeVideoDetail({ comments: [PINNED] }));
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("button", {
        name: "Jump to Abuela Rosa's comment at 0:11",
      }),
    ).toHaveStyle({ left: "50%" });
    expect(
      screen.getByRole("heading", { name: "1 comment, 1 pinned to a moment" }),
    ).toBeVisible();
  });

  it("pins a comment at the moment the transport stands, and its mark appears", async () => {
    const mine = makeComment({
      commentId: "018f0000-0000-7000-8000-00000000d109",
      author: SIGNED_IN,
      body: "That little sigh.",
      atSeconds: 4,
    });
    respondWithItem(makeVideoDetail(), {
      [`POST /api/items/${ITEM_ID}/comments`]: { body: mine, status: 201 },
    });
    renderItem(ITEM_ID);

    const slider = await _slider();
    slider.focus();
    await userEvent.keyboard(
      "{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );

    expect(
      screen.getByRole("button", { name: "Pinned at 0:04" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something at 0:04" }),
      "That little sigh.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("button", {
        name: "Jump to Papá's comment at 0:04",
      }),
    ).toBeVisible();
    expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/comments`)).toEqual({
      body: "That little sigh.",
      atSeconds: 4,
    });
    expect(screen.getByRole("textbox", { name: "Say something" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    ).toBeVisible();
  });

  it("moves the pin with the bar while one is set", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    const slider = await _slider();
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("button", { name: "Pinned at 0:01" }),
    ).toBeVisible();
  });

  it("takes the pin away with Unpin", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    await _slider();
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin" }));

    expect(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Say something" }),
    ).toBeVisible();
  });

  it("moves the transport to a pinned comment's moment from its stamp", async () => {
    respondWithItem(makeVideoDetail({ comments: [PINNED] }));
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    await userEvent.click(within(talk).getByRole("button", { name: /^0:11/ }));

    await waitFor(async () => {
      expect(await _slider()).toHaveAttribute("aria-valuetext", "0:11 of 0:22");
    });
  });

  it("explains, with nothing said yet, that a comment can stand at a moment", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByText(/can stand at a moment in the video/),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/__tests__/ItemVideo.test.tsx`
Expected: FAIL, a video is drawn as a still.

- [ ] **Step 3: Write `useVideoTransport.ts`**

```ts
import { useRef, useState, type RefObject } from "react";
import { playVideo } from "@/system/VideoFrame/playVideo";

/** Where the video stands, and the pin being placed on it. */
export type VideoTransport = {
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  setPosition: (seconds: number) => void;
  /** The moment a comment being written will stand at, if one is set. */
  pendingAt: number | undefined;
  setPendingAt: (seconds: number | undefined) => void;
  /** Moves to a moment and plays from it, which is what a stamp does. */
  seekAndPlay: (seconds: number) => void;
};

/**
 * The transport's state, held above both columns: the left one draws the bar
 * and the pin button, the right one the composer and the stamps.
 *
 * A different item starts at its beginning with nothing pinned. The page is
 * not remounted between items, so the reset happens here, adjusted during
 * render rather than in an effect.
 */
export function useVideoTransport(itemId: string): VideoTransport {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState(0);
  const [pendingAt, setPendingAt] = useState<number | undefined>(undefined);
  const [transportItemId, setTransportItemId] = useState(itemId);
  if (transportItemId !== itemId) {
    setTransportItemId(itemId);
    setPosition(0);
    setPendingAt(undefined);
  }
  return {
    videoRef,
    position,
    setPosition,
    pendingAt,
    setPendingAt,
    seekAndPlay: (seconds) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = seconds;
        playVideo(video);
      }
      setPosition(seconds);
    },
  };
}
```

- [ ] **Step 4: Write `makeMarksFromComments.ts`**

```ts
import type { CommentDto } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import type { TransportMark } from "@/system/VideoFrame/VideoFrame";

/**
 * One mark on the scrubber per comment pinned to a moment, each named for a
 * screen reader by who said it and when, because the mark itself is a 3px
 * line.
 */
export function makeMarksFromComments(
  comments: readonly CommentDto[],
): TransportMark[] {
  return comments.flatMap((comment) => {
    return comment.atSeconds === null
      ? []
      : [
          {
            id: comment.commentId,
            atSeconds: comment.atSeconds,
            label: `Jump to ${comment.author.displayName}'s comment at ${clockLabel(comment.atSeconds)}`,
          },
        ];
  });
}
```

- [ ] **Step 5: Write `PinningSheet.tsx`**

```tsx
import { Button, Stack } from "@mantine/core";
import { IconPinned } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";

type Props = {
  transport: VideoTransport;
};

/**
 * How a comment comes to stand at a moment, said out loud, because nobody
 * guesses that feature. Pressing the button pins at wherever the transport
 * stands; pressing it again, or Unpin under the composer, takes it away.
 */
export function PinningSheet({ transport }: Readonly<Props>): ReactNode {
  const { pendingAt } = transport;
  return (
    <Sheet label="Pinning a comment">
      <Stack gap="sm">
        <LabelText component="h2">Comments on a moment</LabelText>
        <Prose>
          A comment can stand at a moment rather than at the bottom. Press the
          bar where it happens, write it, and it shows up there for everybody:
          on the scrubber and in the thread with the time attached.
        </Prose>
        <ChipRow>
          <Button
            variant={pendingAt === undefined ? "default" : "filled"}
            aria-pressed={pendingAt !== undefined}
            leftSection={<IconPinned {...ICON_PROPS} />}
            onClick={() => {
              transport.setPendingAt(
                pendingAt === undefined ? transport.position : undefined,
              );
            }}
          >
            {pendingAt === undefined
              ? "Pin a comment to this moment"
              : `Pinned at ${clockLabel(pendingAt)}`}
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
```

- [ ] **Step 6: Draw a video in the left column**

`ItemMediaColumn.tsx` becomes:

```tsx
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { VideoFrame } from "@/system/VideoFrame/VideoFrame";
import classes from "@/system/system.module.css";
import { ItemMeta } from "@/surfaces/Item/ItemMeta";
import { ItemReactions } from "@/surfaces/Item/ItemReactions";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { makeMarksFromComments } from "@/surfaces/Item/makeMarksFromComments";
import { PhotoFrame } from "@/surfaces/Item/PhotoFrame";
import { PinningSheet } from "@/surfaces/Item/PinningSheet";
import { SiblingStrip } from "@/surfaces/Item/SiblingStrip/SiblingStrip";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  timezone: string;
  transport: VideoTransport;
};

/**
 * The left column: the frame (a still, or a video on its transport), the line
 * under it, the reaction, and then the run it came from or the pinning sheet.
 *
 * While a pin is set, a press on the bar or an arrow key moves it: that is
 * the whole of the pinning interaction (`prototypes/` surface 4, `pinning`).
 */
export function ItemMediaColumn({
  detail,
  viewer,
  timezone,
  transport,
}: Readonly<Props>): ReactNode {
  const isVideo = detail.kind === "video";
  return (
    <div>
      {isVideo ? (
        <VideoFrame
          media={detail.media}
          marks={makeMarksFromComments(detail.comments)}
          pendingAt={transport.pendingAt}
          videoRef={transport.videoRef}
          position={transport.position}
          onPositionChange={transport.setPosition}
          onScrub={
            transport.pendingAt === undefined
              ? undefined
              : transport.setPendingAt
          }
        />
      ) : (
        <PhotoFrame media={detail.media} />
      )}
      <ItemMeta detail={detail} timezone={timezone} />
      <div className={classes.frameReactions}>
        <ItemReactions detail={detail} viewer={viewer} />
      </div>
      {isVideo ? (
        <PinningSheet transport={transport} />
      ) : (
        <SiblingStrip detail={detail} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Let the thread pin and seek**

`ItemTalk.tsx`: add `transport: VideoTransport;` to `Props` (import the type from `@/surfaces/Item/ItemViewer/useVideoTransport`), destructure it, and:

```tsx
export function ItemTalk({
  detail,
  viewer,
  transport,
}: Readonly<Props>): ReactNode {
  const { send, isSending, error } = useCreateComment(detail.itemId);
  const isVideo = detail.kind === "video";
  return (
    <Talk heading={commentsHeading(detail)}>
      {detail.comments.length === 0 ? (
        <Prose>{quietThreadProse(detail.kind)}</Prose>
      ) : (
        detail.comments.map((comment) => {
          return (
            <ItemComment
              key={comment.commentId}
              itemId={detail.itemId}
              comment={comment}
              viewer={viewer}
              onSeek={isVideo ? transport.seekAndPlay : undefined}
            />
          );
        })
      )}
      <Composer
        goesTo={COMPOSER_HINT}
        isSending={isSending}
        error={error}
        pinnedAt={isVideo ? transport.pendingAt : undefined}
        onClearPin={() => {
          transport.setPendingAt(undefined);
        }}
        onSend={(body, onSent) => {
          send(
            { body, atSeconds: isVideo ? (transport.pendingAt ?? null) : null },
            () => {
              onSent();
              transport.setPendingAt(undefined);
            },
          );
        }}
      />
    </Talk>
  );
}
```

`ItemSheets.tsx`: add `transport: VideoTransport;` to `Props`, destructure it, and pass `transport={transport}` to `ItemTalk`.

`ItemViewer.tsx`: create the transport above both columns and hand it to each:

```tsx
export function ItemViewer({
  detail,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(detail.capturedOn);
  const transport = useVideoTransport(detail.itemId);
  return (
    <>
      <TopBar
        back={{
          label: `Back to ${dayMonthLabel(detail.capturedOn)}`,
          to: "/",
          search: { at: detail.capturedOn },
          onClick: wayBack.onBackClick,
        }}
      />
      <main className={classes.viewer}>
        <h1 className="visually-hidden">{itemHeading(detail)}</h1>
        <ItemMediaColumn
          detail={detail}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
        />
        <ItemSheets
          key={detail.itemId}
          detail={detail}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          onDeleted={wayBack.leave}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item && pnpm --filter @memory-shoebox/web type-check`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/surfaces/Item
git commit -m "feat(web): one video, on its transport, with a comment pinned to a moment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 26: The step's two required tests

**Files:**

- Create: `apps/web/src/surfaces/Item/ItemSurface/__tests__/ItemSurface.capabilities.test.tsx`
- Create: `apps/web/src/surfaces/Item/ItemSurface/__tests__/ItemSurface.latch.test.tsx`

`step-6b.md` § Verification names both. Each sheet's own task already proved its gate red to green; these are the consolidated guards the step asks for, written against the whole surface so that a later change to any one sheet, or a sheet that starts reading the role, fails here. They are expected to pass on their first run; if either fails, a gate or a fetch is wrong, so fix the product, not the test.

- [ ] **Step 1: Write the capabilities test**

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemCapabilities, MeResponse } from "@memory-shoebox/shared";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  OWN_UPLOADER_CAPABILITIES,
  VIEWER_CAPABILITIES,
} from "@/testing/itemFixtures";
import { renderItem, respondWithItem } from "@/testing/itemHarness";

/** Every uploader control, by the role and the words it is drawn with. */
const CONTROLS = {
  tags: { role: "button", name: "+ Add a tag" },
  people: { role: "button", name: "+ Tag somebody" },
  describe: { role: "textbox", name: "Describe this photograph" },
  visibility: { role: "button", name: "Change who can see it" },
  date: { role: "button", name: "Put the date right" },
  delete: { role: "button", name: "Delete this photograph" },
} as const;

type Control = keyof typeof CONTROLS;

/** Which of the controls the page drew, once it has drawn the photograph. */
async function _drawnControls(options: {
  capabilities: ItemCapabilities;
  me: MeResponse;
}): Promise<Control[]> {
  respondWithItem(makeItemDetail({ capabilities: options.capabilities }), {
    "GET /api/me": { body: options.me, status: 200 },
  });
  renderItem(ITEM_ID);
  await screen.findByRole("img", { name: /14 September 2026/ });
  return (Object.keys(CONTROLS) as Control[]).filter((control) => {
    const { role, name } = CONTROLS[control];
    return screen.queryByRole(role, { name }) !== null;
  });
}

describe("which controls are drawn", () => {
  it.each([
    ["a viewer", "viewer", VIEWER_CAPABILITIES, []],
    [
      "an uploader who did not upload it",
      "uploader",
      OTHER_UPLOADER_CAPABILITIES,
      ["tags", "people", "describe"],
    ],
    [
      "the item's own uploader",
      "uploader",
      OWN_UPLOADER_CAPABILITIES,
      ["tags", "people", "describe", "visibility", "date", "delete"],
    ],
  ] as const)(
    "draws for %s exactly what ItemCapabilities allows",
    async (_who, role, capabilities, expected) => {
      expect(
        await _drawnControls({ capabilities, me: createMeResponse({ role }) }),
      ).toEqual(expected);
    },
  );

  it("reads the capabilities and never the role", async () => {
    expect(
      await _drawnControls({
        capabilities: VIEWER_CAPABILITIES,
        me: createMeResponse({ role: "admin" }),
      }),
    ).toEqual([]);
  });

  it("offers asking for it to come down only when the server says so", async () => {
    await _drawnControls({
      capabilities: VIEWER_CAPABILITIES,
      me: createMeResponse({ role: "viewer" }),
    });
    expect(
      screen.queryByRole("link", { name: "Ask for this to come down" }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Write the latch test**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  makeBurstDetail,
  makeComment,
  makeFrameIdFromPosition,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const DETAIL = makeBurstDetail(
  { position: 7, count: 45 },
  { capabilities: OWN_UPLOADER_CAPABILITIES },
);

/** Every `GET` of any item's permalink, which is every open counted. */
function _opens(): string[] {
  return recordedRequests().filter((line) => {
    return /^GET \/api\/items\/[0-9a-f-]+$/u.test(line);
  });
}

describe("what opening an item latches", () => {
  it("counts one open for one arrival, and latches nothing of its own", async () => {
    respondWithItem(DETAIL);
    renderItem(DETAIL.itemId);

    await screen.findByRole("navigation", { name: /45 frames/ });

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
    expect(
      recordedRequests().some((line) => {
        return line.includes("/api/items/seen");
      }),
    ).toBe(false);
  });

  it("sends nothing when a link to another item is preloaded", async () => {
    respondWithItem(DETAIL);
    const { router } = renderItem(DETAIL.itemId);
    await screen.findByRole("navigation", { name: /45 frames/ });

    await router.preloadRoute({
      to: "/items/$itemId",
      params: { itemId: makeFrameIdFromPosition(8) },
    });

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
  });

  it("still counts one open after a comment, a reaction and a tag", async () => {
    respondWithItem(DETAIL, {
      [`POST /api/items/${DETAIL.itemId}/comments`]: {
        body: makeComment({ author: SIGNED_IN, body: "Hello." }),
        status: 201,
      },
      [`PUT /api/items/${DETAIL.itemId}/reaction`]: {
        body: {
          kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
          myKind: "love",
        },
        status: 200,
      },
      [`PUT /api/items/${DETAIL.itemId}/tags`]: { body: DETAIL, status: 200 },
    });
    renderItem(DETAIL.itemId);

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Say something" }),
      "Hello.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Hello.");

    await userEvent.click(
      screen.getAllByRole("button", { name: /^React$/ })[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Love",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "+ Add a tag" }));
    await userEvent.type(screen.getByLabelText("Tags"), "beach{enter}");

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/items/${DETAIL.itemId}/tags`,
      );
    });
    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
  });

  it("asks once more, and says why, when a write is refused", async () => {
    respondWithItem(DETAIL, {
      [`PUT /api/items/${DETAIL.itemId}/tags`]: {
        body: { error: "item_edit_forbidden", message: "x" },
        status: 403,
      },
    });
    renderItem(DETAIL.itemId);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(screen.getByLabelText("Tags"), "beach{enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can no longer change this one.",
    );
    await waitFor(() => {
      expect(_opens()).toHaveLength(2);
    });
  });
});
```

The `/^GET \/api\/items\/[0-9a-f-]+$/u` pattern counts permalinks only: `/api/items/seen` has no hex-and-hyphen tail it could match whole, and the write routes all carry a further segment.

- [ ] **Step 3: Run both**

Run: `pnpm --filter @memory-shoebox/web exec vitest run src/surfaces/Item/ItemSurface`
Expected: PASS. A failure here is a product defect: fix the gate or the fetch.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/surfaces/Item/ItemSurface/__tests__
git commit -m "test(web): the controls follow ItemCapabilities, and one arrival is one open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase F: end to end

Run the whole e2e suite once before starting this phase (`pnpm test:e2e`) so a failure later is known to be new. Every spec here lives in `e2e/item/`: specs run alphabetically under one worker and `empty.spec.ts` needs the catalog empty when it runs, so a spec that seeds must sort after it, which `item/` does and `contrast.spec.ts` does not (`docs/e2e.md` § The archive). Each file seeds in its own `beforeAll`, like `pile.spec.ts`.

### Task 27: Support, and the fan test comes off `fixme`

**Files:**

- Modify: `e2e/support/database.ts`
- Modify: `e2e/pile.spec.ts`

- [ ] **Step 1: Add `readItemViewsForMember`**

Append to `e2e/support/database.ts`:

```ts
/** One `item_views` row, as the latch spec reads it. */
export type ItemViewRow = {
  itemId: string;
  firstSeenAt: string;
  firstOpenedAt: string | null;
  openCount: number;
};

/**
 * Every view row one member has, for asserting what opening an item wrote:
 * `first_opened_at` on the item itself, and `first_seen_at` alone on its
 * siblings (`items.md` Ruling 6).
 *
 * @param memberId The member whose rows to read.
 */
export function readItemViewsForMember(
  memberId: string,
): Promise<ItemViewRow[]> {
  return _withDatabase(async (database) => {
    const rows = await database
      .selectFrom("item_views")
      .select(["item_id", "first_seen_at", "first_opened_at", "open_count"])
      .where("member_id", "=", memberId)
      .execute();
    return rows.map((row) => {
      return {
        itemId: row.item_id,
        firstSeenAt: row.first_seen_at,
        firstOpenedAt: row.first_opened_at,
        openCount: row.open_count,
      };
    });
  });
}
```

- [ ] **Step 2: Turn the fan test on**

In `e2e/pile.spec.ts`, change `test.fixme("fans a burst open in place", ...` to `test("fans a burst open in place", ...` and delete its two-line comment about step 5a.

- [ ] **Step 3: Run it**

Run: `pnpm test:e2e e2e/pile.spec.ts`
Expected: PASS, the fan test included.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/database.ts e2e/pile.spec.ts
git commit -m "test(e2e): the fan test is on, and the latch can be read back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 28: Surface 3 and surface 4, the done-when flow

**Files:**

- Create: `e2e/item/item.photo.spec.ts`
- Create: `e2e/item/item.video.spec.ts`

`step-6b.md` § Done when: open a print from the pile, read what was said, react, leave a comment, pin one to a moment of a video and watch it appear on the scrubber. The seeded clips run ten seconds (`archiveSeed/writeArchivePlan/writeItems.ts`, `duration_ms: 10_000`), so the pin goes at 0:04 rather than 0:42.

- [ ] **Step 1: Write `item.photo.spec.ts`**

```ts
import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surface 3 end to end: opened from a fanned burst in the pile, moved along,
 * reacted to and commented on, and left by the way it came in.
 *
 * The burst is the forty-five-frame candle on 26 September
 * (`apps/server/scripts/archiveSeed/archivePlan.ts`). No media loads in this
 * run (`support/archive.ts`), so nothing here waits on an image.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Opens 26 September, fans the burst, and opens its first frame. */
async function _openTheFirstFrame(page: Page): Promise<void> {
  await page.goto("/?at=2026-09-26");
  const stack = page.locator("[data-burst-id]").first();
  await stack.getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  await stack
    .getByRole("button", { name: /26 September 2026/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}

test("opens a fanned frame from the pile, with its burst beside it", async ({
  adminPage,
}) => {
  await _openTheFirstFrame(adminPage);

  await expect(
    adminPage.getByRole("heading", {
      level: 1,
      name: "A photograph from 26 September 2026",
    }),
  ).toBeAttached();
  await expect(
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();
  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await expect(strip.getByRole("link")).toHaveCount(45);
  await expect(
    strip.getByRole("link", { name: "Frame 1 of 45" }),
  ).toHaveAttribute("aria-current", "page");
});

test("moves along the burst, and Back leaves it rather than stepping through it", async ({
  adminPage,
}) => {
  await _openTheFirstFrame(adminPage);

  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await strip.getByRole("link", { name: "Frame 2 of 45" }).click();
  await expect(
    adminPage.getByText("Frame 2 of 45", { exact: true }),
  ).toBeVisible();

  await adminPage.getByRole("link", { name: "Back to 26 September" }).click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-26$/u);
});

test("reacts and comments, and both are still there after a reload", async ({
  adminPage,
}) => {
  await _openTheFirstFrame(adminPage);

  await adminPage.getByRole("button", { name: "React", exact: true }).click();
  await adminPage
    .getByRole("dialog")
    .getByRole("button", { name: "Love" })
    .click();
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();

  await adminPage
    .getByRole("textbox", { name: "Say something" })
    .fill("He has his mother's chin.");
  await adminPage.getByRole("button", { name: "Send" }).click();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "1 comment" }),
  ).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Write `item.video.spec.ts`**

```ts
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surface 4 end to end: a comment pinned to a moment, and its mark on the
 * scrubber.
 *
 * The one seeded video is on 4 July, ten seconds long. Nothing loads in this
 * run, which is the case the transport is built for: its duration and every
 * mark come from the contract's `durationMs`, not from the element.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("pins a comment to a moment and puts its mark on the scrubber", async ({
  adminPage,
}) => {
  await adminPage.goto("/?at=2026-07-04");
  await adminPage.locator("[data-item-id]").filter({ hasText: "0:10" }).click();

  const slider = adminPage.getByRole("slider", { name: "Where in the video" });
  await expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:10");
  await slider.focus();
  for (let step = 0; step < 4; step += 1) {
    await adminPage.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuetext", "0:04 of 0:10");

  await adminPage
    .getByRole("button", { name: "Pin a comment to this moment" })
    .click();
  await adminPage
    .getByRole("textbox", { name: "Say something at 0:04" })
    .fill("There. That little sigh.");
  await adminPage.getByRole("button", { name: "Send" }).click();

  await expect(
    adminPage.getByRole("button", { name: /comment at 0:04$/u }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "1 comment, 1 pinned to a moment" }),
  ).toBeVisible();
});
```

- [ ] **Step 3: Run them**

Run: `pnpm test:e2e e2e/item`
Expected: PASS, four tests.

- [ ] **Step 4: Commit**

```bash
git add e2e/item
git commit -m "test(e2e): open a print, react, comment, and pin one to a moment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 29: The uploader's controls end to end

**Files:**

- Create: `e2e/item/item.uploader.spec.ts`

The admin uploaded every seeded item, so the admin is the item's own uploader here and holds every capability. Tests run in file order under one worker, and the date correction moves its photograph off its day, so it runs last and the delete uses a different photograph.

- [ ] **Step 1: Write the spec**

```ts
import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * The uploader's half of surface 3: tagging, who can see it, the capture
 * date and the delete, each through the real routes.
 *
 * 23 September holds one photograph (`archivePlan.ts`, "alone-1"), so `?at=`
 * puts it first on the page.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Opens the first photograph of one day. */
async function _openTheFirstPhotographOn(options: {
  page: Page;
  capturedOn: string;
}): Promise<void> {
  const { page, capturedOn } = options;
  await page.goto(`/?at=${capturedOn}`);
  await page.locator("[data-item-id]").first().click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}

test("tags it, and the tag is a way into the pile", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });

  await adminPage.getByRole("button", { name: "+ Add a tag" }).click();
  const field = adminPage.getByLabel("Tags");
  await field.fill("garden party");
  await field.press("Enter");
  await adminPage.getByRole("button", { name: "Done" }).click();

  await expect(
    adminPage.getByRole("link", { name: "garden party" }),
  ).toBeVisible();
});

test("changes who can see it, and changes it back", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await adminPage.getByRole("option", { name: /abuela/iu }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(
    sheet.getByRole("button", { name: "Change who can see it" }),
  ).toBeVisible();
  await expect(sheet.getByText("Everyone", { exact: true })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Everyone", { exact: true }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Everyone", { exact: true })).toBeVisible();
});

test.fixme("offers the Shoebox's members and groups to choose from", async ({
  adminPage,
}) => {
  // `GET /api/members` and `GET /api/groups` are step 8a's. Turn this on when
  // it merges: `apps/web/src/api/members` and `api/groups` are already
  // written against `administration.md` (decision 8 of the step 6b design).
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });
  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await expect(
    adminPage.getByRole("option", { name: /prima/iu }),
  ).toBeVisible();
});

test("deletes it, and it is not there afterwards", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-10",
  });
  const itemUrl = adminPage.url();

  await adminPage
    .getByRole("button", { name: "Delete this photograph" })
    .click();
  await adminPage
    .getByRole("dialog", { name: "Delete this photograph?" })
    .getByRole("button", { name: "Delete it" })
    .click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-10$/u);

  await adminPage.goto(itemUrl);
  await expect(
    adminPage.getByRole("heading", { level: 1, name: "This one is not here." }),
  ).toBeVisible();
});

test("puts the date right, and the photograph moves to its day", async ({
  adminPage,
}) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "When this was taken" });

  await sheet.getByRole("button", { name: "Put the date right" }).click();
  await sheet.getByLabel("The day it was taken").click();
  await adminPage.getByRole("button", { name: "22 September 2026" }).click();
  await sheet.getByRole("button", { name: "Put it right" }).click();

  await expect(sheet.getByText(/^22 September 2026, /u)).toBeVisible();
  await expect(
    adminPage.getByRole("link", { name: "Back to 22 September" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e e2e/item/item.uploader.spec.ts`
Expected: four PASS, one skipped (`fixme`).

- [ ] **Step 3: Commit**

```bash
git add e2e/item/item.uploader.spec.ts
git commit -m "test(e2e): tag, change who sees it, delete, and put the date right

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 30: The latch and the keyboard, end to end

**Files:**

- Create: `e2e/item/item.latch.spec.ts`
- Create: `e2e/item/item.keyboard.spec.ts`

- [ ] **Step 1: Write `item.latch.spec.ts`**

```ts
import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import {
  clearItemViewsForMember,
  readItemViewsForMember,
  seedMemberAtAddress,
} from "../support/database.ts";
import { ADMIN_EMAIL, expect, test } from "../support/signedIn.ts";

/**
 * What opening an item writes, read back from the catalog itself
 * (`step-6b.md` § Verification).
 *
 * Opening latches the item opened and its siblings seen only, which is what
 * keeps surface 17's "scrolled past, never opened" row honest. The pile's own
 * latch would muddy this, so the item is reached through the pile once, its
 * views are cleared, and the permalink is reloaded on its own.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** The first frame of the 26 September burst, by way of the pile. */
async function _reachTheFirstFrame(page: Page): Promise<string> {
  await page.goto("/?at=2026-09-26");
  const stack = page.locator("[data-burst-id]").first();
  await stack.getByRole("button").first().click();
  await stack
    .getByRole("button", { name: /26 September 2026/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
  return page.url().split("/").pop() ?? "";
}

test("opens the item and only sees its forty-four siblings", async ({
  adminPage,
}) => {
  const { memberId } = await seedMemberAtAddress({
    email: ADMIN_EMAIL,
    role: "admin",
  });
  const itemId = await _reachTheFirstFrame(adminPage);

  await clearItemViewsForMember(memberId);
  await adminPage.reload();
  await expect(
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();

  const views = await readItemViewsForMember(memberId);
  const opened = views.filter((view) => {
    return view.firstOpenedAt !== null;
  });
  const seenOnly = views.filter((view) => {
    return view.firstOpenedAt === null;
  });
  expect(
    opened.map((view) => {
      return view.itemId;
    }),
  ).toEqual([itemId]);
  expect(opened[0]?.openCount).toBe(1);
  expect(seenOnly).toHaveLength(44);
});
```

- [ ] **Step 2: Write `item.keyboard.spec.ts`**

```ts
import type { Locator, Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surfaces 3 and 4 with nothing but a keyboard (`step-6b.md`
 * § Verification): open an item, move through the siblings, react, comment,
 * pin a comment to a moment. Nothing may depend on hover, and the reactions
 * picker, portalled to the end of the page, is the worked example of why.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Presses a key until `locator` has focus, failing after `limit` presses. */
async function _pressUntilFocused(options: {
  page: Page;
  locator: Locator;
  key?: "Tab" | "Shift+Tab";
  limit?: number;
}): Promise<void> {
  const { page, locator, key = "Tab", limit = 250 } = options;
  for (let press = 0; press < limit; press += 1) {
    const isFocused = await locator
      .evaluate((element) => {
        return element === document.activeElement;
      })
      .catch(() => {
        return false;
      });
    if (isFocused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(`${limit} presses of ${key} never reached the control`);
}

test("opens a frame, moves along the burst, reacts and comments", async ({
  adminPage,
}) => {
  await adminPage.goto("/?at=2026-09-26");
  const stack = adminPage.locator("[data-burst-id]").first();
  await _pressUntilFocused({
    page: adminPage,
    locator: stack.getByRole("button").first(),
  });
  await adminPage.keyboard.press("Enter");
  const firstFrame = stack
    .getByRole("button", { name: /26 September 2026/ })
    .first();
  await _pressUntilFocused({ page: adminPage, locator: firstFrame });
  await adminPage.keyboard.press("Enter");
  await expect(
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();

  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await _pressUntilFocused({
    page: adminPage,
    locator: strip.getByRole("link", { name: "Frame 1 of 45" }),
  });
  await adminPage.keyboard.press("ArrowRight");
  await expect(
    strip.getByRole("link", { name: "Frame 2 of 45" }),
  ).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(
    adminPage.getByText("Frame 2 of 45", { exact: true }),
  ).toBeVisible();

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", { name: "React", exact: true }),
    key: "Shift+Tab",
  });
  await adminPage.keyboard.press("Enter");
  const picker = adminPage.getByRole("dialog");
  await expect(picker.getByRole("button", { name: "Like" })).toBeFocused();
  await adminPage.keyboard.press("Tab");
  await adminPage.keyboard.press("Enter");
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();

  const field = adminPage.getByRole("textbox", { name: "Say something" });
  await _pressUntilFocused({ page: adminPage, locator: field });
  await adminPage.keyboard.type("Typed without a mouse.");
  await adminPage.keyboard.press("Tab");
  await expect(adminPage.getByRole("button", { name: "Send" })).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(adminPage.getByText("Typed without a mouse.")).toBeVisible();
});

test("pins a comment to a moment of a video", async ({ adminPage }) => {
  await adminPage.goto("/?at=2026-07-04");
  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.locator("[data-item-id]").filter({ hasText: "0:10" }),
  });
  await adminPage.keyboard.press("Enter");

  const slider = adminPage.getByRole("slider", { name: "Where in the video" });
  await _pressUntilFocused({ page: adminPage, locator: slider });
  for (let step = 0; step < 3; step += 1) {
    await adminPage.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuetext", "0:03 of 0:10");

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", {
      name: "Pin a comment to this moment",
    }),
  });
  await adminPage.keyboard.press("Enter");

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("textbox", { name: "Say something at 0:03" }),
  });
  await adminPage.keyboard.type("Watch his hand here.");
  await adminPage.keyboard.press("Tab");
  await adminPage.keyboard.press("Enter");

  await expect(
    adminPage.getByRole("button", { name: /comment at 0:03$/u }),
  ).toBeVisible();
});
```

- [ ] **Step 3: Run them**

Run: `pnpm test:e2e e2e/item/item.latch.spec.ts e2e/item/item.keyboard.spec.ts`
Expected: three PASS. If the picker's first choice is not focused, `trapFocus` did not reach the dropdown: check Task 10's two `Popover` props before changing the test.

- [ ] **Step 4: Commit**

```bash
git add e2e/item/item.latch.spec.ts e2e/item/item.keyboard.spec.ts
git commit -m "test(e2e): one open and forty-four sightings, and the whole flow by keyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 31: Zoom and contrast

**Files:**

- Create: `e2e/item/item.responsive.spec.ts`
- Create: `e2e/item/item.contrast.spec.ts`

- [ ] **Step 1: Write `item.responsive.spec.ts`**

```ts
import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Both surfaces at 200% zoom with no horizontal scroll and nothing clipped
 * (`PRODUCT.md` § Accessibility & Inclusion). 200% of the 1280px design width
 * is a 640px viewport, which is how `pile.spec.ts` measures the same promise;
 * 400px is the phone.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Whether the page scrolls sideways. */
function _overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
    );
  });
}

for (const width of [640, 400]) {
  test(`draws a photograph at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await adminPage.goto("/?at=2026-09-23");
    await adminPage.locator("[data-item-id]").first().click();
    await expect(
      adminPage.getByRole("region", { name: "Comments" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });

  test(`draws a video at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await adminPage.goto("/?at=2026-07-04");
    await adminPage
      .locator("[data-item-id]")
      .filter({ hasText: "0:10" })
      .click();
    await expect(
      adminPage.getByRole("slider", { name: "Where in the video" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });
}
```

- [ ] **Step 2: Write `item.contrast.spec.ts`**

```ts
import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import {
  getContrastFailuresFromPage,
  makeReportFromContrastFailures,
} from "../support/contrast.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surfaces 3 and 4 against AA, in both colour schemes at both widths, with
 * every sheet the item's own uploader gets and two editors open.
 *
 * In `e2e/item/` rather than in `contrast.spec.ts`, because that file runs
 * before `empty.spec.ts` and this one needs the archive seeded
 * (`docs/e2e.md` § The archive). The method is the same: reduced motion so a
 * settled colour is measured, and a property asserted rather than a picture.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

const WIDTHS = [
  { label: "1280px", size: { width: 1280, height: 900 } },
  { label: "400px", size: { width: 400, height: 860 } },
] as const;

const SCHEMES = ["light", "dark"] as const;

const RENDITION_NAMES = { light: "Day", dark: "Night" } as const;

/** Sweeps whatever is on screen and fails with everything needed to fix it. */
async function _expectTheViewToMeetAa(options: {
  page: Page;
  where: string;
}): Promise<void> {
  const failures = await getContrastFailuresFromPage(options.page);
  expect(
    failures,
    failures.length === 0
      ? ""
      : makeReportFromContrastFailures({ where: options.where, failures }),
  ).toEqual([]);
}

for (const scheme of SCHEMES) {
  for (const { label, size } of WIDTHS) {
    const rendition = RENDITION_NAMES[scheme];

    test(`surfaces 3 and 4 meet AA in ${rendition} at ${label}`, async ({
      adminPage,
    }) => {
      await adminPage.setViewportSize(size);
      await adminPage.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "reduce",
      });

      await adminPage.goto("/?at=2026-09-23");
      await adminPage.locator("[data-item-id]").first().click();
      await expect(
        adminPage.getByRole("region", { name: "Who can see this" }),
      ).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one photo, its uploader (${rendition}, ${label})`,
      });

      await adminPage
        .getByRole("button", { name: "Change who can see it" })
        .click();
      await adminPage
        .getByRole("button", { name: "Put the date right" })
        .click();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one photo, two editors open (${rendition}, ${label})`,
      });

      await adminPage.goto("/?at=2026-07-04");
      await adminPage
        .locator("[data-item-id]")
        .filter({ hasText: "0:10" })
        .click();
      await expect(
        adminPage.getByRole("slider", { name: "Where in the video" }),
      ).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one video (${rendition}, ${label})`,
      });
    });
  }
}
```

- [ ] **Step 3: Run them**

Run: `pnpm test:e2e e2e/item/item.responsive.spec.ts e2e/item/item.contrast.spec.ts`
Expected: eight PASS. A contrast failure names the words, both colours and the ratio. The usual cause is quiet ink chosen for the wrong ground (`docs/web.md` § Styling: `--on-panel-quiet` on the panel, the print's own quiet ink on a sheet): `Prose onPanel` is for text drawn straight on the enamel, and everything inside a `Sheet` or the `Talk` panel is on a print. Fix the component, not the spec.

- [ ] **Step 4: Commit**

```bash
git add e2e/item/item.responsive.spec.ts e2e/item/item.contrast.spec.ts
git commit -m "test(e2e): surfaces 3 and 4 at 200% zoom, and against AA in both schemes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase G: documentation and verification

### Task 32: Keep the docs current

**Files:**

- Modify: `docs/web.md`
- Modify: `docs/e2e.md`
- Modify: `docs/prds/2026-09-27-memory-shoebox/plan/step-6b.md`
- Modify: `docs/prds/2026-09-27-memory-shoebox/plan/README.md`

`AGENTS.md`: updating the docs is part of done. High level, no restating code, no em dashes.

- [ ] **Step 1: `docs/web.md`**

1. The opening paragraph: say step 6b built surfaces 3 and 4, so **eight** surfaces are live (1, 2, 3, 4, 5, 6, 7 and 9) and the other routes still render a placeholder.
2. The layout tree: add `Item/ surfaces 3 and 4: one route, the viewer, the strip, the thread, the sheets` under `surfaces/`, and under `api/` add `items/`, `comments/`, `reactions/`, `visibilityRules/`, and `members/` and `groups/` (noting "against step 8a's contract"). Change the `bursts/bursts.ts` line to "a burst's frames, as `BurstFrameRef`". The `routes/` line: "two shells, six live, eight placeholders" (or count them again and say what is true).
3. Rename "## The six built surfaces" to "## The built surfaces" and add, after the people directory's paragraph:

```markdown
**Surfaces 3 and 4, one photo and one video.** `/items/$itemId` is both,
chosen once the item answers, in `surfaces/Item/`. **The route has no loader
and must not grow one**: `GET /api/items/:itemId` counts an open every time it
runs, surface 17 prints that count, and the router preloads a loader whenever a
pointer rests on a link. So the surface fetches with `useQuery`, which
refetches on mount (arriving again is opening again) and never on focus.

**Every write lands in the cache and nothing invalidates it.** The five writes
that answer with a whole `ItemDetail` replace the entry; comments and reactions
answer with something smaller that `itemWrites/itemCacheUpdates` folds in.
Invalidating would be a refetch, and a refetch is an open. All writes on one
item share one mutation scope, for the reason surface 9's two `PATCH /api/me`
writes do, and a `403` or `404` on a write refetches the item once so the page
agrees with the server again. After any write the pile's queries are marked
stale without being refetched, so the pile is right when somebody returns.

**Controls are drawn from `ItemCapabilities` and never from the role.** The
split is by consequence (`conventions.md` § Who may change an item): any
uploader may tag, name people and describe; only the item's own uploader or an
admin may change who sees it, correct its date or delete it. A test gives an
admin's role with every capability false to keep it that way.

**The burst strip is one tab stop.** The open frame takes Tab, the arrow keys
move along the rest, and a move replaces the history entry, so Back leaves the
burst. It draws from `burstFrames` (capped at sixty) or, for a longer run, the
frames route, and never from a sibling's permalink. It latches nothing itself:
the item's own `GET` writes `first_opened_at` for the item and `first_seen_at`
for every visible sibling (`server.md` § The item slice).

**The video transport is a slider whose marks come from the contract.** Marks
are placed from `media.durationMs` on first paint rather than after metadata
loads; the scrubber is a `role="slider"` with arrow, Page and Home/End keys,
the marks sit in a layer over it rather than inside it, and the position is
held above both columns so a comment can be pinned from it. Nothing autoplays.

**The visibility picker is written against step 8a.** `api/members` and
`api/groups` parse both shapes of those routes with local schemas. Until 8a
merges they answer `404`, and the picker offers the people and groups the rule
already names plus the viewer, so "Everyone" and "Only me" work end to end.

People and tags are links into the pile filtered by them, because a person is a
filter rather than a profile and a chip with nothing to do would be a
focusable button that does nothing.
```

4. "## Talking to the API": add that `jsonInit` takes `PUT` for the set-replacing routes.
5. "## Tests": add one paragraph: `testing/surfaceHarness` records each request's method and body (`recordedRequests`, `recordedBodyOf`) because the item page has a read and a write at one address; `testing/itemFixtures` and `testing/itemHarness` are the item route's fixtures and canned server.

- [ ] **Step 2: `docs/e2e.md`**

1. "## The archive, and why one spec runs before the others": add `item/` to the list of what `empty` precedes, and one sentence that a spec needing the archive must sort after `empty.spec.ts`, which is why surfaces 3 and 4 live in `e2e/item/`.
2. "## The contrast sweep": add that surfaces 3 and 4 are swept by `e2e/item/item.contrast.spec.ts`, with the item's own uploader's sheets and two editors open, and that it lives apart from `contrast.spec.ts` because it needs the archive.
3. Add a section:

```markdown
## Surfaces 3 and 4

`e2e/item/` opens prints from the pile and drives every write through the real
routes: a reaction and a comment that survive a reload, a comment pinned at
0:04 of the ten-second seeded clip, a tag, a visibility change and back, a date
correction and a delete. `item.latch.spec.ts` reads `item_views` back and
asserts one open and forty-four sightings for one frame of the forty-five-frame
burst. `item.keyboard.spec.ts` does all of it without a mouse, which is how the
reactions picker's focus trap is checked: jsdom cannot.

Nothing loads in this run, so the transport is measured with no media at all,
which is exactly the case its duration-from-the-contract rule is for.

One case is parked: the picker offering the Shoebox's members and groups is
`fixme` until step 8a builds `GET /api/members` and `GET /api/groups`.
```

- [ ] **Step 3: The plan's own status**

In `step-6b.md`, set `**Status:** done`. In the plan `README.md`, set 6b's row to `done`, and rewrite the "Where this is up to" paragraph to say 6b is merged once it is, naming what it left for later steps: the parked picker e2e case for 8a, the "Who has opened it" panel for step 9 (`canSeeViewers` is in the payload and unused), and the removal ask's link into surface 10 for 8b.

- [ ] **Step 4: Check the docs**

Run: `pnpm format && grep -rn "—" docs/web.md docs/e2e.md docs/prds/2026-09-27-memory-shoebox/plan/step-6b.md docs/prds/2026-09-27-memory-shoebox/plan/README.md`
Expected: the formatter is clean and the grep finds no em dash introduced by this step (compare with `git diff`).

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: surfaces 3 and 4 in the web and e2e docs, and step 6b's status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 33: Verify the step

**Files:** none new, unless a check finds something to fix.

- [ ] **Step 1: The whole check**

Run: `pnpm check`
Expected: green. Fix anything it finds in the file that caused it, then rerun.

- [ ] **Step 2: The whole e2e suite**

Run: `pnpm test:e2e`
Expected: every test passes except the `fixme` cases (the picker in `item.uploader.spec.ts`, and any that were already parked before this step).

- [ ] **Step 3: Side by side with the prototypes**

With the development archive seeded (`pnpm seed:archive --as <your address>`, which uploads the cartoon media when `.env.server.local` carries B2 credentials, `docs/configuration.md` § Something to look at), run `pnpm dev` and `pnpm dev:prototypes`, then screenshot every state at 1280, 768 and 400px in both colour schemes and compare each against its prototype URL:

| Prototype                                                                 | The real page                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/s/photo?state=viewer`                                                   | A frame of the 26 September burst, signed in as `prima@example.com`     |
| `/s/photo?state=uploader`, `visibility`, `delete`, `fix-date`, `describe` | A photograph signed in as its uploader, each editor open in turn        |
| `/s/photo?state=reactions`                                                | The same with a reaction left                                           |
| `/s/photo?state=quiet`                                                    | A photograph with no comments                                           |
| `/s/video?state=paused`, `playing`, `pinning`, `quiet`                    | The 4 July video, paused, playing, with a pin set, and with no comments |

`/s/photo?state=who-opened` is deliberately not built (decision on scope: step 9). Record every difference that is deliberate (the rewritten copy in decision 11, the links on chips, the strip's caption) and fix any that is not.

- [ ] **Step 4: The accessibility tree**

With Playwright, take an accessibility snapshot of a photograph and of the video and check, by reading it: one `h1` naming the item; the photograph's `img` carrying the composed alt text; the strip as a `navigation` named by its span with one link `aria-current="page"`; the comments as a `region` named "Comments"; every control with a name; the slider with its `aria-valuetext`. A pass with a real screen reader cannot be run from this session: report it as the one verification left for a person.

- [ ] **Step 5: Commit any fixes, and report**

Commit each fix with its own message. Then report with the summary format `~/.claude/CLAUDE.md` asks for: a bold one-line topline, what changed and why, and a Next Actions table naming the screen-reader pass as Juan Pablo's.
