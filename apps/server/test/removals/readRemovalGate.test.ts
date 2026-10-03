import { describe, expect, it } from "vitest";
import { readRemovalGate } from "../../src/removals/readRemovalGate.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertPerson,
  insertItemPerson,
  insertRemovalRequest,
} from "../helpers/seedHelpers/seedHelpers.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";

describe("readRemovalGate", () => {
  it("requires a linked account tagged on this item and scopes open requests to that account and item", async () => {
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
  });
});
