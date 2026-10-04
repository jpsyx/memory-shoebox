import type { Database } from "../../../../src/db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { listItemRemovalRequestsResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertRemovalRequest,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type DeclinesOneOfTwoSimultaneousAsksWithout2State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type DeclinesOneOfTwoSimultaneousAsksWithout2State1 =
  DeclinesOneOfTwoSimultaneousAsksWithout2State0 & {
    uploader: Awaited<ReturnType<typeof insertSignedInMember>>;
    firstRequester: Awaited<ReturnType<typeof insertMember>>;
    secondRequester: Awaited<ReturnType<typeof insertMember>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    admin: Awaited<ReturnType<typeof insertSignedInMember>>;
    outsider: Awaited<ReturnType<typeof insertSignedInMember>>;
  };

type DeclinesOneOfTwoSimultaneousAsksWithout2State2 =
  DeclinesOneOfTwoSimultaneousAsksWithout2State1 & { askIds: string[] };

type DeclinesOneOfTwoSimultaneousAsksWithout2State3 =
  DeclinesOneOfTwoSimultaneousAsksWithout2State2;

type DeclinesOneOfTwoSimultaneousAsksWithout2State4 =
  DeclinesOneOfTwoSimultaneousAsksWithout2State3 & {
    response: import("fastify").LightMyRequestResponse;
    otherAsk: Selectable<Database["removal_requests"]>;
  };

type DeclinesOneOfTwoSimultaneousAsksWithout2State5 =
  DeclinesOneOfTwoSimultaneousAsksWithout2State4;

async function _declinesOneOfTwoSimultaneousAsksWithout2Stage1(
  state: Readonly<DeclinesOneOfTwoSimultaneousAsksWithout2State0>,
): Promise<DeclinesOneOfTwoSimultaneousAsksWithout2State1> {
  const { database } = state;
  const uploader = await insertSignedInMember({ database });
  const firstRequester = await insertMember(database);
  const secondRequester = await insertMember(database);
  const itemId = await insertItem(database, {
    uploadedBy: uploader.memberId,
  });
  await insertRendition(database, { itemId });
  const admin = await insertSignedInMember({
    database,
    token: "admin",
    member: { role: "admin" },
  });
  const outsider = await insertSignedInMember({
    database,
    token: "outsider",
    member: { role: "viewer" },
  });
  return {
    ...state,
    uploader,
    firstRequester,
    secondRequester,
    itemId,
    admin,
    outsider,
  };
}

async function _declinesOneOfTwoSimultaneousAsksWithout2Stage2(
  state: Readonly<DeclinesOneOfTwoSimultaneousAsksWithout2State1>,
): Promise<DeclinesOneOfTwoSimultaneousAsksWithout2State2> {
  const { firstRequester, secondRequester, database, itemId, uploader } = state;
  const askIds = await Promise.all(
    [firstRequester, secondRequester].map(async (requesterId) => {
      return insertRemovalRequest(database, {
        item_id: itemId,
        requestedByMemberId: requesterId,
        itemUploaderMemberId: uploader.memberId,
        state: "open",
        decline_reason: null,
        resolved_at: null,
        resolved_by_member_id: null,
      });
    }),
  );
  return { ...state, askIds };
}

async function _declinesOneOfTwoSimultaneousAsksWithout2Stage3(
  state: Readonly<DeclinesOneOfTwoSimultaneousAsksWithout2State2>,
): Promise<DeclinesOneOfTwoSimultaneousAsksWithout2State3> {
  const { uploader, admin, outsider, app, itemId } = state;
  for (const [member, numRequests] of [
    [uploader, 2],
    [admin, 2],
    [outsider, 0],
  ] as const) {
    const response = await app.inject({
      url: `/api/items/${itemId}/removal-requests`,
      headers: { cookie: member.cookie },
    });
    expect(response.statusCode).toBe(200);
    const envelope = listItemRemovalRequestsResponseSchema.parse(
      response.json(),
    );
    expect(envelope.item.itemId).toBe(itemId);
    expect(envelope.removalRequests).toHaveLength(numRequests);
    expect(envelope.canRequestRemoval).toBe(false);
    expect(envelope.nextCursor).toBeNull();
  }
  return { ...state };
}

async function _declinesOneOfTwoSimultaneousAsksWithout2Stage4(
  state: Readonly<DeclinesOneOfTwoSimultaneousAsksWithout2State3>,
): Promise<DeclinesOneOfTwoSimultaneousAsksWithout2State4> {
  const { app, askIds, uploader, database } = state;
  const response = await app.inject({
    method: "POST",
    url: `/api/removal-requests/${askIds[0]}/decline`,
    headers: { cookie: uploader.cookie },
    payload: { declineReason: "My reason" },
  });
  expect(response.statusCode).toBe(200);
  const otherAsk = await database
    .selectFrom("removal_requests")
    .selectAll()
    .where("id", "=", askIds[1]!)
    .executeTakeFirstOrThrow();
  expect(otherAsk).toMatchObject({
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  return { ...state, response, otherAsk };
}

async function _declinesOneOfTwoSimultaneousAsksWithout2Stage5(
  state: Readonly<DeclinesOneOfTwoSimultaneousAsksWithout2State4>,
): Promise<DeclinesOneOfTwoSimultaneousAsksWithout2State5> {
  const { database, askIds } = state;
  expect(
    (
      await database
        .selectFrom("removal_requests")
        .selectAll()
        .where("id", "=", askIds[0]!)
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe("declined");
  return { ...state };
}

async function _assertDeclinesOneOfTwoSimultaneousAsksWithoutSettling2(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _declinesOneOfTwoSimultaneousAsksWithout2Stage1(state0);
    const state2 =
      await _declinesOneOfTwoSimultaneousAsksWithout2Stage2(state1);
    const state3 =
      await _declinesOneOfTwoSimultaneousAsksWithout2Stage3(state2);
    const state4 =
      await _declinesOneOfTwoSimultaneousAsksWithout2Stage4(state3);
    await _declinesOneOfTwoSimultaneousAsksWithout2Stage5(state4);
  } finally {
    await close();
  }
}
describe("removal requests", (): void => {
  it(
    "declines one of two simultaneous asks without settling the other",
    _assertDeclinesOneOfTwoSimultaneousAsksWithoutSettling2,
  );
});
