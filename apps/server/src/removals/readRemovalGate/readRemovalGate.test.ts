import { describe, expect, it } from "vitest";
import { readRemovalGate } from "./readRemovalGate.ts";
import { createTestApp } from "../../../test/helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertPerson,
  insertItemPerson,
  insertRemovalRequest,
} from "../../../test/helpers/seedHelpers/seedHelpers.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
type OpenRemovalRequestFixture = {
  readonly state: "open";
  readonly resolved_at: null;
  readonly resolved_by_member_id: null;
  readonly decline_reason: null;
};

type RequiresALinkedAccountTaggedOnThis1State0 = Record<never, never>;
type RequiresALinkedAccountTaggedOnThis1State1 =
  RequiresALinkedAccountTaggedOnThis1State0 & {
    database: Awaited<ReturnType<typeof createTestApp>>["database"];
    close: Awaited<ReturnType<typeof createTestApp>>["close"];
    memberId: Awaited<ReturnType<typeof insertMember>>;
    otherMemberId: Awaited<ReturnType<typeof insertMember>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    otherItemId: Awaited<ReturnType<typeof insertItem>>;
    viewer: import(
      "../../http/requestContextHelpers.ts",
      { with: { "resolution-mode": "import" } }
    ).Viewer;
    gate: () => Promise<
      import(
        "./readRemovalGate.ts",
        { with: { "resolution-mode": "import" } }
      ).RemovalGate
    >;
    unlinked: Awaited<ReturnType<typeof insertPerson>>;
  };
type RequiresALinkedAccountTaggedOnThis1State2 =
  RequiresALinkedAccountTaggedOnThis1State1 & {
    other: Awaited<ReturnType<typeof insertPerson>>;
    linked: Awaited<ReturnType<typeof insertPerson>>;
  };
type RequiresALinkedAccountTaggedOnThis1State3 =
  RequiresALinkedAccountTaggedOnThis1State2 & {
    open: OpenRemovalRequestFixture;
  };
type RequiresALinkedAccountTaggedOnThis1State4 =
  RequiresALinkedAccountTaggedOnThis1State3;

async function _requiresALinkedAccountTaggedOnThis1Stage1(
  state: Readonly<RequiresALinkedAccountTaggedOnThis1State0>,
): Promise<RequiresALinkedAccountTaggedOnThis1State1> {
  const { database, close } = await createTestApp();
  const memberId = await insertMember(database);
  const otherMemberId = await insertMember(database);
  const itemId = await insertItem(database, {
    uploadedBy: otherMemberId,
    seq: 1,
  });
  const otherItemId = await insertItem(database, {
    uploadedBy: otherMemberId,
    seq: 2,
  });
  const viewer: Viewer = {
    memberId,
    sessionId: "session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [],
  };
  const gate = () => {
    return readRemovalGate({ database, viewer, itemId });
  };
  const unlinked = await insertPerson(database, { displayName: "Unlinked" });
  return {
    ...state,
    database,
    close,
    memberId,
    otherMemberId,
    itemId,
    otherItemId,
    viewer,
    gate,
    unlinked,
  };
}

async function _requiresALinkedAccountTaggedOnThis1Stage2(
  state: Readonly<RequiresALinkedAccountTaggedOnThis1State1>,
): Promise<RequiresALinkedAccountTaggedOnThis1State2> {
  const {
    database,
    otherMemberId,
    memberId,
    itemId,
    unlinked,
    otherItemId,
    gate,
  } = state;
  const other = await insertPerson(database, {
    displayName: "Other",
    member_id: otherMemberId,
  });
  const linked = await insertPerson(database, {
    displayName: "Linked",
    member_id: memberId,
  });
  await insertItemPerson(database, { itemId, personId: unlinked });
  await insertItemPerson(database, { itemId, personId: other });
  await insertItemPerson(database, { itemId: otherItemId, personId: linked });
  expect(await gate()).toEqual({
    isPeopleTagged: false,
    hasOpenRemovalRequest: false,
  });
  await insertItemPerson(database, { itemId, personId: linked });
  await insertRemovalRequest(database, {
    requestedByMemberId: memberId,
    itemUploaderMemberId: otherMemberId,
    item_id: itemId,
  });
  return { ...state, other, linked };
}

async function _requiresALinkedAccountTaggedOnThis1Stage3(
  state: Readonly<RequiresALinkedAccountTaggedOnThis1State2>,
): Promise<RequiresALinkedAccountTaggedOnThis1State3> {
  const { database, memberId, otherMemberId, otherItemId, itemId, gate } =
    state;
  const open = {
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  } as const;
  await insertRemovalRequest(database, {
    requestedByMemberId: memberId,
    itemUploaderMemberId: otherMemberId,
    item_id: otherItemId,
    ...open,
  });
  await insertRemovalRequest(database, {
    requestedByMemberId: otherMemberId,
    itemUploaderMemberId: otherMemberId,
    item_id: itemId,
    ...open,
  });
  expect(await gate()).toEqual({
    isPeopleTagged: true,
    hasOpenRemovalRequest: false,
  });
  return { ...state, open };
}

async function _requiresALinkedAccountTaggedOnThis1Stage4(
  state: Readonly<RequiresALinkedAccountTaggedOnThis1State3>,
): Promise<RequiresALinkedAccountTaggedOnThis1State4> {
  const { database, memberId, otherMemberId, itemId, open, gate, close } =
    state;
  await insertRemovalRequest(database, {
    requestedByMemberId: memberId,
    itemUploaderMemberId: otherMemberId,
    item_id: itemId,
    ...open,
  });
  expect(await gate()).toEqual({
    isPeopleTagged: true,
    hasOpenRemovalRequest: true,
  });
  await close();
  return { ...state };
}

async function _assertRequiresALinkedAccountTaggedOnThisItem1(): Promise<void> {
  const state0 = {};
  const state1 = await _requiresALinkedAccountTaggedOnThis1Stage1(state0);
  const state2 = await _requiresALinkedAccountTaggedOnThis1Stage2(state1);
  const state3 = await _requiresALinkedAccountTaggedOnThis1Stage3(state2);
  await _requiresALinkedAccountTaggedOnThis1Stage4(state3);
}
describe("readRemovalGate", () => {
  it(
    "requires a linked account tagged on this item and scopes open requests to that account and item",
    _assertRequiresALinkedAccountTaggedOnThisItem1,
  );
});
