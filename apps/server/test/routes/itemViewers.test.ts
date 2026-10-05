import type { ItemViewerRow } from "@memory-shoebox/shared";
import { afterEach, describe, expect, it } from "vitest";
import { itemViewersResponseSchema } from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertMember,
  insertItem,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertGroup,
  insertGroupMember,
} from "../helpers/seedHelpers/seedHelpers.ts";

let testApp: TestApp;
afterEach(async () => {
  await testApp?.close();
});

async function _createApp(isAdmin = true): Promise<string> {
  const memberId = createId();
  testApp = await createTestApp({
    authenticate: async () => {
      return makeViewer({ memberId, isAdmin });
    },
  });
  await insertMember(testApp.database, {
    id: memberId,
    role: isAdmin ? "admin" : "viewer",
    display_name: "Admin",
  });
  return memberId;
}

async function _insertView(options: {
  memberId: string;
  itemId: string;
  isOpened: boolean;
}): Promise<void> {
  await testApp.database
    .insertInto("item_views")
    .values({
      id: createId(),
      member_id: options.memberId,
      item_id: options.itemId,
      first_seen_at: "2026-09-20T00:00:00.000Z",
      first_opened_at: options.isOpened ? "2026-09-21T00:00:00.000Z" : null,
      last_opened_at: options.isOpened ? "2026-09-22T00:00:00.000Z" : null,
      open_count: options.isOpened ? 4 : 0,
    })
    .execute();
}

type ExpectEligibleViewerRowsOptions = {
  viewers: readonly ItemViewerRow[];
  removedId: string;
  seenId: string;
  adminId: string;
  unseenId: string;
  uploaderId: string;
};

function _expectEligibleViewerRows(
  options: Readonly<ExpectEligibleViewerRowsOptions>,
): void {
  const { viewers, removedId, seenId, adminId, unseenId, uploaderId } = options;
  expect(
    viewers.map((row) => {
      return row.member.memberId;
    }),
  ).toEqual([removedId, seenId, adminId, unseenId, uploaderId]);
  expect(viewers[0]).toMatchObject({ hasOpened: true, openCount: 4 });
  expect(viewers[1]).toMatchObject({
    hasOpened: false,
    firstSeenAt: "2026-09-20T00:00:00.000Z",
  });
  expect(viewers[2]).toMatchObject({
    hasOpened: false,
    firstSeenAt: null,
    openCount: 0,
  });
}

type EligibleViewerFixtureResult = {
  personId: string;
  taggedId: string;
  itemId: string;
  seenId: string;
  removedId: string;
  removedSeenId: string;
  adminId: string;
  unseenId: string;
  uploaderId: string;
  ruleId: string;
};

async function _insertRemovedViewerMembers(): Promise<{
  removedId: string;
  removedSeenId: string;
}> {
  const removedId = await insertMember(testApp.database, {
    status: "removed",
  });
  const removedSeenId = await insertMember(testApp.database, {
    status: "removed",
  });
  return { removedId, removedSeenId };
}

async function _prepareEligibleViewerFixture(): Promise<EligibleViewerFixtureResult> {
  const adminId = await _createApp();
  const uploaderId = await insertMember(testApp.database, {
    display_name: "Uploader",
  });
  const seenId = await insertMember(testApp.database, {
    display_name: "Seen",
  });
  const unseenId = await insertMember(testApp.database, {
    display_name: "Unseen",
    status: "invited",
  });
  const taggedId = await insertMember(testApp.database, {
    display_name: "Tagged",
  });
  const { removedId, removedSeenId } = await _insertRemovedViewerMembers();
  const ruleId = await insertVisibilityRule(testApp.database, {
    mode: "only",
  });
  await insertVisibilityRuleSubject(testApp.database, {
    ruleId,
    memberId: seenId,
  });
  const groupId = await insertGroup(testApp.database);
  await insertGroupMember(testApp.database, { groupId, memberId: unseenId });
  await insertVisibilityRuleSubject(testApp.database, { ruleId, groupId });
  const itemId = await insertItem(testApp.database, {
    uploadedBy: uploaderId,
    visibility_rule_id: ruleId,
  });
  const personId = createId();
  return {
    personId,
    taggedId,
    itemId,
    seenId,
    removedId,
    removedSeenId,
    adminId,
    unseenId,
    uploaderId,
    ruleId,
  };
}

async function _prepareOrderedViewerFixture(): Promise<{
  memberIds: string[];
  itemId: string;
  uploaderId: string;
}> {
  const uploaderId = await _createApp();
  const itemId = await insertItem(testApp.database, {
    uploadedBy: uploaderId,
  });
  const names = [
    "Many opens",
    "Recent open",
    "Older open",
    "Earlier sight",
    "Later sight",
    "Zed unseen",
  ];
  const memberIds = await Promise.all(
    names.map(async (display_name) => {
      return insertMember(testApp.database, { display_name });
    }),
  );
  return { memberIds, itemId, uploaderId };
}

async function _insertTaggedOnlyViewer(
  options: Readonly<{ personId: string; taggedId: string; itemId: string }>,
): Promise<void> {
  const { personId, taggedId, itemId } = options;
  await testApp.database
    .insertInto("people")
    .values({
      id: personId,
      display_name: "Tagged",
      preferred_face_item_id: null,
      created_by: null,
      member_id: taggedId,
      created_at: "2026-09-20T00:00:00.000Z",
    })
    .execute();
  await testApp.database
    .insertInto("item_people")
    .values({
      id: createId(),
      item_id: itemId,
      person_id: personId,
      tagged_by: null,
      tagged_at: "2026-09-20T00:00:00.000Z",
    })
    .execute();
}

describe("item viewers", () => {
  it("checks visibility before role, with byte-identical missing and invisible 404", async () => {
    await _createApp(false);
    const uploaderId = await insertMember(testApp.database);
    const ruleId = await insertVisibilityRule(testApp.database, {
      mode: "only",
    });
    const itemId = await insertItem(testApp.database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });
    const invisible = await testApp.app.inject({
      url: `/api/items/${itemId}/viewers`,
    });
    const missing = await testApp.app.inject({
      url: `/api/items/${createId()}/viewers`,
    });
    expect(invisible.statusCode).toBe(404);
    expect(invisible.body).toBe(missing.body);
    const visibleId = await insertItem(testApp.database, {
      uploadedBy: uploaderId,
      seq: 1,
    });
    expect(
      (await testApp.app.inject({ url: `/api/items/${visibleId}/viewers` }))
        .statusCode,
    ).toBe(403);
  });

  it("includes eligible unseen, seen-only, uploader, admins and removed opened history, never tagged-only", async () => {
    const {
      personId,
      taggedId,
      itemId,
      seenId,
      removedId,
      removedSeenId,
      adminId,
      unseenId,
      uploaderId,
      ruleId,
    } = await _prepareEligibleViewerFixture();
    await _insertTaggedOnlyViewer({ personId, taggedId, itemId });
    await _insertView({ memberId: seenId, itemId, isOpened: false });
    await _insertView({ memberId: removedId, itemId, isOpened: true });
    await _insertView({ memberId: removedSeenId, itemId, isOpened: false });
    const response = await testApp.app.inject({
      url: `/api/items/${itemId}/viewers`,
    });
    expect(response.statusCode).toBe(200);
    const viewers = itemViewersResponseSchema.parse(response.json()).viewers;
    _expectEligibleViewerRows({
      viewers,
      removedId,
      seenId,
      adminId,
      unseenId,
      uploaderId,
    });
    await testApp.database
      .updateTable("visibility_rules")
      .set({ mode: "except" })
      .where("id", "=", ruleId)
      .execute();
    const exceptIds = (
      await testApp.app.inject({ url: `/api/items/${itemId}/viewers` })
    )
      .json()
      .viewers.map((row: { member: { memberId: string } }) => {
        return row.member.memberId;
      });
    expect(exceptIds).toContain(taggedId);
    expect(exceptIds).not.toContain(unseenId);
    expect(exceptIds).not.toContain(seenId);
  });
  it("orders openings by count then latest instant, sightings by earliest instant and unseen by name", async () => {
    const { memberIds, itemId, uploaderId } =
      await _prepareOrderedViewerFixture();
    await Promise.all(
      memberIds.slice(0, 5).map(async (memberId, rowIndex) => {
        const hasOpened = rowIndex < 3;
        await testApp.database
          .insertInto("item_views")
          .values({
            id: createId(),
            member_id: memberId,
            item_id: itemId,
            first_seen_at:
              rowIndex === 4
                ? "2026-09-21T00:00:00.000Z"
                : "2026-09-20T00:00:00.000Z",
            first_opened_at: hasOpened ? "2026-09-21T00:00:00.000Z" : null,
            last_opened_at: hasOpened
              ? rowIndex === 1
                ? "2026-09-24T00:00:00.000Z"
                : "2026-09-22T00:00:00.000Z"
              : null,
            open_count: rowIndex === 0 ? 5 : hasOpened ? 4 : 0,
          })
          .execute();
      }),
    );
    const response = await testApp.app.inject({
      url: `/api/items/${itemId}/viewers`,
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json().viewers.map((row: { member: { memberId: string } }) => {
        return row.member.memberId;
      }),
    ).toEqual([...memberIds.slice(0, 5), uploaderId, memberIds[5]]);
  });

  it("has fixed query cost while expanding a growing eligible member set", async () => {
    const uploaderId = await _createApp();
    const itemId = await insertItem(testApp.database, {
      uploadedBy: uploaderId,
    });
    const counted = makeQueryCountingDatabaseFromDatabase(testApp.database);
    testApp.app.database = counted.database;
    const firstResponse = await testApp.app.inject({
      url: `/api/items/${itemId}/viewers`,
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(counted.getQueryCount()).toBe(4);
    await Promise.all(
      Array.from({ length: 25 }, () => {
        return insertMember(testApp.database);
      }),
    );
    counted.reset();
    const response = await testApp.app.inject({
      url: `/api/items/${itemId}/viewers`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().viewers).toHaveLength(26);
    expect(counted.getQueryCount()).toBe(4);
  });
});
