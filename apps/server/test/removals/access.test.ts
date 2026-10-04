import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
  insertRemovalRequest,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";
import { getRemovalRequestFromRequestIdOr404 } from "../../src/removals/getRemovalRequestFromRequestIdOr404.ts";
import { makeRemovalRequestDtosFromRows } from "../../src/removals/makeRemovalRequestDtosFromRows.ts";
import { readRemovalRequests } from "../../src/removals/removalReadHelpers.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";

type RetainsRequesterControlWithoutMediaAfterAccess1State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  b2: Awaited<ReturnType<typeof createTestApp>>["b2"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type RetainsRequesterControlWithoutMediaAfterAccess1State1 =
  RetainsRequesterControlWithoutMediaAfterAccess1State0 & {
    requester: Awaited<ReturnType<typeof insertSignedInMember>>;
    outsider: Awaited<ReturnType<typeof insertSignedInMember>>;
    uploader: Awaited<ReturnType<typeof insertMember>>;
    ruleId: Awaited<ReturnType<typeof insertVisibilityRule>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
  };
type RetainsRequesterControlWithoutMediaAfterAccess1State2 =
  RetainsRequesterControlWithoutMediaAfterAccess1State1 & {
    requestId: Awaited<ReturnType<typeof insertRemovalRequest>>;
    viewer: ReturnType<typeof makeViewer>;
    row: Awaited<ReturnType<typeof getRemovalRequestFromRequestIdOr404>>;
    dto:
      | Awaited<ReturnType<typeof makeRemovalRequestDtosFromRows>>[0]
      | undefined;
  };
type RetainsRequesterControlWithoutMediaAfterAccess1State3 =
  RetainsRequesterControlWithoutMediaAfterAccess1State2 & {
    outsiderRequest: { method: "POST"; headers: { cookie: string } };
  };
type RetainsRequesterControlWithoutMediaAfterAccess1State4 =
  RetainsRequesterControlWithoutMediaAfterAccess1State3 & {
    inaccessible: import("fastify").LightMyRequestResponse;
    nonexistent: import("fastify").LightMyRequestResponse;
  };

type CountsSnapshotUploaderScopeIncludesDeletedHistory2State0 = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  b2: Awaited<ReturnType<typeof createTestApp>>["b2"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type CountsSnapshotUploaderScopeIncludesDeletedHistory2State1 =
  CountsSnapshotUploaderScopeIncludesDeletedHistory2State0 & {
    uploader: Awaited<ReturnType<typeof insertMember>>;
    requester: Awaited<ReturnType<typeof insertMember>>;
    otherUploader: Awaited<ReturnType<typeof insertMember>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    deletedId: Awaited<ReturnType<typeof insertRemovalRequest>>;
  };
type CountsSnapshotUploaderScopeIncludesDeletedHistory2State2 =
  CountsSnapshotUploaderScopeIncludesDeletedHistory2State1 & {
    askIds: string[];
    counted: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
    viewer: ReturnType<typeof makeViewer>;
    read: (
      limit: number,
      cursor?: string | undefined,
    ) => Promise<{
      removalRequests: Array<{
        requestId: string;
        state: "open" | "deleted" | "declined" | "withdrawn";
        itemId: string | null;
        requestedBy: { memberId: string; displayName: string };
        reason: string | null;
        declineReason: string | null;
        createdAt: string;
        resolvedAt: string | null;
        resolvedBy: { memberId: string; displayName: string } | null;
        uploadedBy: { memberId: string; displayName: string };
        itemCapturedAt: string | null;
        media: {
          thumb: {
            url: string;
            expiresAt: string;
            width: number;
            height: number;
          };
          display: {
            url: string;
            expiresAt: string;
            width: number;
            height: number;
          };
          poster: {
            url: string;
            expiresAt: string;
            width: number;
            height: number;
          } | null;
          video: {
            webm: {
              url: string;
              expiresAt: string;
              width: number;
              height: number;
            } | null;
            mp4: {
              url: string;
              expiresAt: string;
              width: number;
              height: number;
            } | null;
          } | null;
          durationMs: number | null;
          altText: string;
        } | null;
        canWithdraw: boolean;
        canDecline: boolean;
        canDeleteItem: boolean;
      }>;
      nextCursor: string | null;
      openCount: number;
      settledCount: number;
    }>;
    small: Awaited<ReturnType<typeof readRemovalRequests>>;
  };
type CountsSnapshotUploaderScopeIncludesDeletedHistory2State3 =
  CountsSnapshotUploaderScopeIncludesDeletedHistory2State2 & {
    smallCount: number;
    large: Awaited<ReturnType<typeof readRemovalRequests>>;
    pagedIds: string[];
    cursor: string | null;
  };
type CountsSnapshotUploaderScopeIncludesDeletedHistory2State4 =
  CountsSnapshotUploaderScopeIncludesDeletedHistory2State3;

async function _retainsRequesterControlWithoutMediaAfterAccess1Stage1(
  state: Readonly<RetainsRequesterControlWithoutMediaAfterAccess1State0>,
): Promise<RetainsRequesterControlWithoutMediaAfterAccess1State1> {
  const { database } = state;
  const requester = await insertSignedInMember({
    database,
    member: { role: "viewer" },
  });
  const outsider = await insertSignedInMember({
    database,
    token: "outsider",
    member: { role: "viewer" },
  });
  const uploader = await insertMember(database);
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  const itemId = await insertItem(database, {
    uploadedBy: uploader,
    visibility_rule_id: ruleId,
  });
  await insertRendition(database, { itemId });
  return { ...state, requester, outsider, uploader, ruleId, itemId };
}

async function _retainsRequesterControlWithoutMediaAfterAccess1Stage2(
  state: Readonly<RetainsRequesterControlWithoutMediaAfterAccess1State1>,
): Promise<RetainsRequesterControlWithoutMediaAfterAccess1State2> {
  const { database, itemId, requester, uploader, b2 } = state;
  const requestId = await insertRemovalRequest(database, {
    item_id: itemId,
    requestedByMemberId: requester.memberId,
    itemUploaderMemberId: uploader,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  const viewer = makeViewer({
    memberId: requester.memberId,
    role: "viewer",
  });
  const row = await getRemovalRequestFromRequestIdOr404({
    database,
    viewer,
    requestId,
  });
  const [dto] = await makeRemovalRequestDtosFromRows({
    database,
    b2,
    viewer,
    rows: [row],
    now: new Date(NOW),
  });
  expect(dto).toMatchObject({ media: null, canWithdraw: true });
  return { ...state, requestId, viewer, row, dto };
}

async function _retainsRequesterControlWithoutMediaAfterAccess1Stage3(
  state: Readonly<RetainsRequesterControlWithoutMediaAfterAccess1State2>,
): Promise<RetainsRequesterControlWithoutMediaAfterAccess1State3> {
  const { requester, app, itemId, outsider } = state;
  for (const method of ["GET", "POST"] as const) {
    const request = {
      method,
      headers: { cookie: requester.cookie },
      ...(method === "POST" ? { payload: {} } : {}),
    };
    const invisible = await app.inject({
      ...request,
      url: `/api/items/${itemId}/removal-requests`,
    });
    const missing = await app.inject({
      ...request,
      url: `/api/items/${createId()}/removal-requests`,
    });
    expect(invisible.statusCode).toBe(404);
    expect(invisible.body).toBe(missing.body);
  }
  const outsiderRequest = {
    method: "POST" as const,
    headers: { cookie: outsider.cookie },
  };
  return { ...state, outsiderRequest };
}

async function _retainsRequesterControlWithoutMediaAfterAccess1Stage4(
  state: Readonly<RetainsRequesterControlWithoutMediaAfterAccess1State3>,
): Promise<RetainsRequesterControlWithoutMediaAfterAccess1State4> {
  const { app, outsiderRequest, requestId, requester } = state;
  const inaccessible = await app.inject({
    ...outsiderRequest,
    url: `/api/removal-requests/${requestId}/withdraw`,
  });
  const nonexistent = await app.inject({
    ...outsiderRequest,
    url: `/api/removal-requests/${createId()}/withdraw`,
  });
  expect(inaccessible.statusCode).toBe(404);
  expect(inaccessible.body).toBe(nonexistent.body);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/removal-requests/${requestId}/withdraw`,
        headers: { cookie: requester.cookie },
      })
    ).json(),
  ).toMatchObject({ state: "withdrawn", media: null });
  return { ...state, inaccessible, nonexistent };
}

async function _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage1(
  state: Readonly<CountsSnapshotUploaderScopeIncludesDeletedHistory2State0>,
): Promise<CountsSnapshotUploaderScopeIncludesDeletedHistory2State1> {
  const { database } = state;
  const uploader = await insertMember(database);
  const requester = await insertMember(database);
  const otherUploader = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: uploader });
  await insertRendition(database, { itemId });
  const deletedId = await insertRemovalRequest(database, {
    requestedByMemberId: requester,
    itemUploaderMemberId: uploader,
    state: "deleted",
    decline_reason: null,
  });
  await insertRemovalRequest(database, {
    requestedByMemberId: requester,
    itemUploaderMemberId: otherUploader,
  });
  return { ...state, uploader, requester, otherUploader, itemId, deletedId };
}

async function _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage2(
  state: Readonly<CountsSnapshotUploaderScopeIncludesDeletedHistory2State1>,
): Promise<CountsSnapshotUploaderScopeIncludesDeletedHistory2State2> {
  const { database, requester, uploader, itemId, b2 } = state;
  const askIds = await Promise.all(
    Array.from({ length: 4 }, async () => {
      return insertRemovalRequest(database, {
        requestedByMemberId: requester,
        itemUploaderMemberId: uploader,
        item_id: itemId,
      });
    }),
  );
  const counted = makeQueryCountingDatabaseFromDatabase(database);
  const viewer = makeViewer({ memberId: uploader });
  const read = (limit: number, cursor?: string) => {
    return readRemovalRequests({
      database: counted.database,
      b2,
      viewer,
      now: new Date(NOW),
      query: { state: "settled", limit, cursor },
    });
  };
  counted.reset();
  const small = await read(1);
  return { ...state, askIds, counted, viewer, read, small };
}

async function _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage3(
  state: Readonly<CountsSnapshotUploaderScopeIncludesDeletedHistory2State2>,
): Promise<CountsSnapshotUploaderScopeIncludesDeletedHistory2State3> {
  const { counted, read, deletedId, askIds, small } = state;
  const smallCount = counted.getQueryCount();

  counted.reset();
  const large = await read(20);
  expect(counted.getQueryCount()).toBe(smallCount);
  expect(large).toMatchObject({
    openCount: 0,
    settledCount: 5,
    nextCursor: null,
  });
  expect(
    large.removalRequests.map((row) => {
      return row.requestId;
    }),
  ).toContain(deletedId);
  expect(large.removalRequests).toHaveLength(askIds.length + 1);
  expect(small.nextCursor).not.toBeNull();
  const pagedIds = small.removalRequests.map((row) => {
    return row.requestId;
  });
  const cursor = small.nextCursor;
  return { ...state, smallCount, large, pagedIds, cursor };
}

async function _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage4(
  state: Readonly<CountsSnapshotUploaderScopeIncludesDeletedHistory2State3>,
): Promise<CountsSnapshotUploaderScopeIncludesDeletedHistory2State4> {
  const { read, pagedIds, askIds, deletedId } = state;
  let cursor = state.cursor;
  while (cursor !== null) {
    const page = await read(1, cursor);
    pagedIds.push(
      ...page.removalRequests.map((row) => {
        return row.requestId;
      }),
    );
    cursor = page.nextCursor;
  }
  expect(pagedIds).toEqual([...askIds, deletedId].sort().reverse());
  expect(new Set(pagedIds).size).toBe(5);
  return { ...state };
}

async function _assertRetainsRequesterControlWithoutMediaAfterAccessNarrows1(): Promise<void> {
  const { app, database, b2, close } = await createTestApp();
  try {
    const state0 = { app, database, b2, close };
    const state1 =
      await _retainsRequesterControlWithoutMediaAfterAccess1Stage1(state0);
    const state2 =
      await _retainsRequesterControlWithoutMediaAfterAccess1Stage2(state1);
    const state3 =
      await _retainsRequesterControlWithoutMediaAfterAccess1Stage3(state2);
    await _retainsRequesterControlWithoutMediaAfterAccess1Stage4(state3);
  } finally {
    await close();
  }
}

async function _assertCountsSnapshotUploaderScopeIncludesDeletedHistoryAnd2(): Promise<void> {
  const { database, b2, close } = await createTestApp();
  try {
    const state0 = { database, b2, close };
    const state1 =
      await _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage1(state0);
    const state2 =
      await _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage2(state1);
    const state3 =
      await _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage3(state2);
    await _countsSnapshotUploaderScopeIncludesDeletedHistory2Stage4(state3);
  } finally {
    await close();
  }
}
describe("removal privacy and batches", () => {
  it(
    "retains requester control without media after access narrows and hides requests from outsiders",
    _assertRetainsRequesterControlWithoutMediaAfterAccessNarrows1,
  );

  it(
    "counts snapshot uploader scope, includes deleted history and keeps query counts fixed",
    _assertCountsSnapshotUploaderScopeIncludesDeletedHistoryAnd2,
  );
});
