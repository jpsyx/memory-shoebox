import { expect } from "vitest";
import type { InjectOptions } from "fastify";
import type { ZodType } from "zod";
import {
  createMilestoneResponseSchema,
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesResponseSchema,
  setMilestoneItemsResponseSchema,
  reconcileMilestoneResponseSchema,
  timelineResponseSchema,
  createRemovalRequestResponseSchema,
  listItemRemovalRequestsResponseSchema,
} from "@memory-shoebox/shared";
import type { TestApp } from "../helpers/createTestApp.ts";
import {
  insertSignedInMember,
  type SignedInMember,
} from "../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertItemPerson,
  insertPerson,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";
type ReadResponseOptions<Output> = {
  app: TestApp["app"];
  request: InjectOptions;
  schema: ZodType<Output>;
  status?: number;
};
/** Shared members and media for one complete removal lifecycle. */
export type LifecycleContext = TestApp & {
  uploader: SignedInMember;
  requester: SignedInMember;
  admin: SignedInMember;
  itemId: string;
  personId: string;
  read: <Output>(
    options: Readonly<Omit<ReadResponseOptions<Output>, "app">>,
  ) => Promise<Output>;
};
async function _readResponse<Output>(
  options: Readonly<ReadResponseOptions<Output>>,
): Promise<Output> {
  const response = await options.app.inject(options.request);
  expect(response.statusCode, response.body).toBe(options.status ?? 200);
  return options.schema.parse(response.json());
}
async function _insertLifecycleMembers(
  database: TestApp["database"],
): Promise<Pick<LifecycleContext, "uploader" | "requester" | "admin">> {
  const uploader = await insertSignedInMember({
    database,
    token: "uploader",
    member: { role: "uploader" },
  });
  const requester = await insertSignedInMember({
    database,
    token: "requester",
    member: { role: "viewer", notify_on_removal: 0 },
  });
  const admin = await insertSignedInMember({
    database,
    token: "admin",
    member: { role: "admin" },
  });
  return { uploader, requester, admin };
}
/** Seeds the members, tagged item, renditions, and typed HTTP reader. */
export async function makeLifecycleContextFromTestApp(
  testApp: Readonly<TestApp>,
): Promise<LifecycleContext> {
  const { app, database } = testApp;
  const { uploader, requester, admin } =
    await _insertLifecycleMembers(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  const itemId = await insertItem(database, {
    uploadedBy: uploader.memberId,
  });
  await insertRendition(database, { itemId, purpose: "original" });
  await insertRendition(database, { itemId });
  const personId = await insertPerson(database, {
    displayName: "Requester",
    member_id: requester.memberId,
  });
  await insertItemPerson(database, { itemId, personId });
  const read = <Output>(
    options: Readonly<Omit<ReadResponseOptions<Output>, "app">>,
  ): Promise<Output> => {
    return _readResponse({ app, ...options });
  };
  return { ...testApp, uploader, requester, admin, itemId, personId, read };
}
/** Creates the occasion before its picker and attachment phases. */
export async function createLifecycleMilestone(
  context: Readonly<LifecycleContext>,
): Promise<string> {
  const { uploader, read } = context;
  const milestone = await read({
    request: {
      method: "POST",
      url: "/api/milestones",
      headers: { cookie: uploader.cookie },
      payload: {
        name: "Family weekend",
        startsOn: "2026-09-20",
        endsOn: "2026-09-22",
        blurb: null,
      },
    },
    schema: createMilestoneResponseSchema,
    status: 201,
  });
  const milestoneId = milestone.milestone.milestoneId;
  expect(milestone).toMatchObject({
    itemCount: 0,
    dayCount: 3,
    mismatchCount: 0,
  });
  return milestoneId;
}
/** Checks the unfiltered picker before attaching the outside-span item. */
export async function checkLifecycleCandidates(
  options: Readonly<{
    context: Readonly<LifecycleContext>;
    milestoneId: string;
  }>,
): Promise<void> {
  const { context, milestoneId } = options;
  const { uploader, itemId, read } = context;
  const candidates = await read({
    request: {
      url: `/api/milestones/${milestoneId}/candidates?scope=all`,
      headers: { cookie: uploader.cookie },
    },
    schema: listMilestoneCandidatesResponseSchema,
  });
  expect(candidates.candidates).toMatchObject([
    { item: { itemId }, isAttached: false, isOutsideSpan: true },
  ]);
}
/** Attaches the item and confirms its pending date mismatch. */
export async function attachLifecycleItem(
  options: Readonly<{
    context: Readonly<LifecycleContext>;
    milestoneId: string;
  }>,
): Promise<void> {
  const { context, milestoneId } = options;
  const { uploader, itemId, read } = context;
  const attached = await read({
    request: {
      method: "PATCH",
      url: `/api/milestones/${milestoneId}/items`,
      headers: { cookie: uploader.cookie },
      payload: { attach: [itemId], detach: [] },
    },
    schema: setMilestoneItemsResponseSchema,
  });
  expect(attached).toMatchObject({
    attachedCount: 1,
    detachedCount: 0,
    mismatchCount: 1,
  });
  const mismatches = await read({
    request: {
      url: `/api/milestones/${milestoneId}/mismatches`,
      headers: { cookie: uploader.cookie },
    },
    schema: listMilestoneMismatchesResponseSchema,
  });
  expect(mismatches.mismatches).toMatchObject([{ item: { itemId } }]);
}
/** Moves the item and verifies people/attachment timeline filters. */
export async function reconcileLifecycleItem(
  options: Readonly<{
    context: Readonly<LifecycleContext>;
    milestoneId: string;
  }>,
): Promise<void> {
  const { context, milestoneId } = options;
  const { uploader, requester, itemId, personId, read } = context;
  const reconciled = await read({
    request: {
      method: "POST",
      url: `/api/milestones/${milestoneId}/reconcile`,
      headers: { cookie: uploader.cookie },
      payload: {
        mode: "move",
        moves: [{ itemId, targetOn: "2026-09-21" }],
      },
    },
    schema: reconcileMilestoneResponseSchema,
  });
  expect(reconciled).toMatchObject({ movedCount: 1, mismatchCount: 0 });
  const timeline = await read({
    request: {
      url: `/api/timeline?people=${personId}&attachedToMilestoneId=${milestoneId}`,
      headers: { cookie: requester.cookie },
    },
    schema: timelineResponseSchema,
  });
  expect(timeline.resultCount).toBe(1);
  expect(timeline.days).toMatchObject([
    { capturedOn: "2026-09-21", items: [{ itemId }] },
  ]);
  const excluded = await read({
    request: {
      url: `/api/timeline?people=${personId}&attachedToMilestoneId=${milestoneId}&excludeAttached=true`,
      headers: { cookie: requester.cookie },
    },
    schema: timelineResponseSchema,
  });
  expect(excluded.resultCount).toBe(0);
  expect(excluded.days).toEqual([]);
}
/** Creates a fresh ask and verifies its item-scoped response. */
export async function requestLifecycleRemoval(
  context: Readonly<LifecycleContext>,
): Promise<string> {
  const { requester, itemId, read } = context;
  const request = await read({
    request: {
      method: "POST",
      url: `/api/items/${itemId}/removal-requests`,
      headers: { cookie: requester.cookie },
      payload: { reason: "Please take this down." },
    },
    schema: createRemovalRequestResponseSchema,
    status: 201,
  });
  expect(request).toMatchObject({
    state: "open",
    canWithdraw: true,
    itemCapturedAt: "2026-09-21T10:00:00.000Z",
  });
  const itemRequests = await read({
    request: {
      url: `/api/items/${itemId}/removal-requests`,
      headers: { cookie: requester.cookie },
    },
    schema: listItemRemovalRequestsResponseSchema,
  });
  expect(itemRequests).toMatchObject({
    canRequestRemoval: false,
    removalRequests: expect.arrayContaining([
      expect.objectContaining({ requestId: request.requestId }),
    ]),
  });
  return request.requestId;
}
