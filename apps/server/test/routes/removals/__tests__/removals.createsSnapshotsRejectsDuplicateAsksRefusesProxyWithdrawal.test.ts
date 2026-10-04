import { describe, expect, it } from "vitest";
import {
  listItemRemovalRequestsResponseSchema,
  createRemovalRequestResponseSchema,
} from "@memory-shoebox/shared";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertItem,
  insertPerson,
  insertItemPerson,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State1 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State0 & {
    requester: Awaited<ReturnType<typeof insertSignedInMember>>;
    uploader: Awaited<ReturnType<typeof insertSignedInMember>>;
    admin: Awaited<ReturnType<typeof insertSignedInMember>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
  };

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State2 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State1 & {
    personId: Awaited<ReturnType<typeof insertPerson>>;
    eligible: import("fastify").LightMyRequestResponse;
  };

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State3 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State2 & {
    ask: () => Promise<import("fastify").LightMyRequestResponse>;
    created: import("fastify").LightMyRequestResponse;
    requestId: string;
  };

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State4 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State3;

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State5 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State4 & {
    decline: (
      reason: string,
    ) => Promise<import("fastify").LightMyRequestResponse>;
  };

type CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State6 =
  CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State5;

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage1(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State0>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State1> {
  const { database } = state;
  const requester = await insertSignedInMember({
    database,
    member: { role: "viewer" },
  });
  const uploader = await insertSignedInMember({
    database,
    token: "uploader",
    member: { role: "uploader" },
  });
  const admin = await insertSignedInMember({
    database,
    token: "admin",
    member: { role: "admin" },
  });
  const itemId = await insertItem(database, {
    uploadedBy: uploader.memberId,
  });
  await insertRendition(database, {
    itemId,
    purpose: "original",
    storage_key: "private/original",
  });
  return { ...state, requester, uploader, admin, itemId };
}

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage2(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State1>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State2> {
  const { database, requester, itemId, app } = state;
  const personId = await insertPerson(database, {
    displayName: "Requester",
    member_id: requester.memberId,
  });
  await insertItemPerson(database, { itemId, personId });
  await insertRendition(database, { itemId });
  const eligible = await app.inject({
    url: `/api/items/${itemId}/removal-requests`,
    headers: { cookie: requester.cookie },
  });
  expect(eligible.statusCode).toBe(200);
  expect(
    listItemRemovalRequestsResponseSchema.parse(eligible.json()),
  ).toMatchObject({
    item: { itemId },
    canRequestRemoval: true,
    removalRequests: [],
    nextCursor: null,
  });
  return { ...state, personId, eligible };
}

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage3(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State2>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State3> {
  const { app, itemId, requester, database, uploader } = state;
  const ask = () => {
    return app.inject({
      method: "POST",
      url: `/api/items/${itemId}/removal-requests`,
      headers: { cookie: requester.cookie },
      payload: { reason: "  own words  " },
    });
  };
  const created = await ask();
  expect(created.statusCode).toBe(201);
  const requestId = createRemovalRequestResponseSchema.parse(
    created.json(),
  ).requestId;
  expect(
    await database
      .selectFrom("removal_requests")
      .select([
        "item_uploader_member_id",
        "item_captured_at",
        "item_storage_key",
      ])
      .where("id", "=", requestId)
      .executeTakeFirstOrThrow(),
  ).toEqual({
    item_uploader_member_id: uploader.memberId,
    item_captured_at: NOW,
    item_storage_key: "private/original",
  });
  return { ...state, ask, created, requestId };
}

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage4(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State3>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State4> {
  const { created, ask, admin, uploader, app, requestId } = state;
  expect(created.json()).toMatchObject({
    reason: "own words",
    state: "open",
    canWithdraw: true,
    canDecline: false,
  });
  expect(created.body).not.toContain("private/original");
  expect((await ask()).json().error).toBe("removal_already_requested");
  for (const member of [admin, uploader]) {
    const refused = await app.inject({
      method: "POST",
      url: `/api/removal-requests/${requestId}/withdraw`,
      headers: { cookie: member.cookie },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe("removal_request_forbidden");
  }
  return { ...state };
}

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage5(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State4>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State5> {
  const { app, requestId, uploader } = state;
  const decline = (reason: string) => {
    return app.inject({
      method: "POST",
      url: `/api/removal-requests/${requestId}/decline`,
      headers: { cookie: uploader.cookie },
      payload: { declineReason: reason },
    });
  };
  expect((await decline("  ")).statusCode).toBe(400);
  expect((await decline("my explanation")).json()).toMatchObject({
    state: "declined",
    declineReason: "my explanation",
  });
  expect((await decline("again")).json().error).toBe(
    "removal_request_not_open",
  );
  return { ...state, decline };
}

async function _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage6(
  state: Readonly<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State5>,
): Promise<CreatesSnapshotsRejectsDuplicateAsksRefusesProxy1State6> {
  const { admin, uploader, app, requestId, ask } = state;
  for (const member of [admin, uploader]) {
    const refused = await app.inject({
      method: "POST",
      url: `/api/removal-requests/${requestId}/withdraw`,
      headers: { cookie: member.cookie },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe("removal_request_forbidden");
  }
  expect((await ask()).statusCode).toBe(201);
  return { ...state };
}

async function _assertCreatesSnapshotsRejectsDuplicateAsksRefusesProxyWithdrawal1(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage1(state0);
    const state2 =
      await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage2(state1);
    const state3 =
      await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage3(state2);
    const state4 =
      await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage4(state3);
    const state5 =
      await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage5(state4);
    await _createsSnapshotsRejectsDuplicateAsksRefusesProxy1Stage6(state5);
  } finally {
    await close();
  }
}
describe("removal requests", (): void => {
  it(
    "creates snapshots, rejects duplicate asks, refuses proxy withdrawal, and permits asking again after decline",
    _assertCreatesSnapshotsRejectsDuplicateAsksRefusesProxyWithdrawal1,
  );
});
