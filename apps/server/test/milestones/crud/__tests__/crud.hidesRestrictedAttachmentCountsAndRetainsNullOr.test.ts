import { describe, expect, it } from "vitest";
import { listMilestonesResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type HidesRestrictedAttachmentCountsAndRetainsNull3State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type HidesRestrictedAttachmentCountsAndRetainsNull3State1 =
  HidesRestrictedAttachmentCountsAndRetainsNull3State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    creator: Awaited<ReturnType<typeof insertMember>>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    rule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hidden: Awaited<ReturnType<typeof insertItem>>;
    visible: Awaited<ReturnType<typeof insertItem>>;
  };

type HidesRestrictedAttachmentCountsAndRetainsNull3State2 =
  HidesRestrictedAttachmentCountsAndRetainsNull3State1 & {
    detail: import("fastify").LightMyRequestResponse;
    list: ReturnType<typeof listMilestonesResponseSchema.parse>;
  };

type HidesRestrictedAttachmentCountsAndRetainsNull3State3 =
  HidesRestrictedAttachmentCountsAndRetainsNull3State2 & {
    withoutCreator: import("fastify").LightMyRequestResponse;
  };

async function _hidesRestrictedAttachmentCountsAndRetainsNull3Stage1(
  state: Readonly<HidesRestrictedAttachmentCountsAndRetainsNull3State0>,
): Promise<HidesRestrictedAttachmentCountsAndRetainsNull3State1> {
  const { database } = state;
  const { cookie } = await insertSignedInMember({
    database,
    member: { role: "viewer" },
  });
  const creator = await insertMember(database);
  const milestoneId = await insertMilestone(database, {
    name: "All members",
    startsOn: "2026-09-01",
    created_by: creator,
  });
  const rule = await insertVisibilityRule(database, { mode: "only" });
  const hidden = await insertItem(database, {
    uploadedBy: creator,
    visibility_rule_id: rule,
  });
  const visible = await insertItem(database, {
    uploadedBy: creator,
    seq: 1,
  });
  await insertItemMilestone(database, { milestoneId, itemId: hidden });
  await insertItemMilestone(database, { milestoneId, itemId: visible });
  return { ...state, cookie, creator, milestoneId, rule, hidden, visible };
}

async function _hidesRestrictedAttachmentCountsAndRetainsNull3Stage2(
  state: Readonly<HidesRestrictedAttachmentCountsAndRetainsNull3State1>,
): Promise<HidesRestrictedAttachmentCountsAndRetainsNull3State2> {
  const { cookie, app, milestoneId, creator } = state;
  const detail = await app.inject({
    url: `/api/milestones/${milestoneId}`,
    headers: { cookie },
  });
  expect(detail.statusCode).toBe(200);
  expect(detail.json()).toMatchObject({
    itemCount: 1,
    mismatchCount: 1,
    canEdit: false,
    canDelete: false,
    createdBy: { memberId: creator },
  });
  const list = listMilestonesResponseSchema.parse(
    (
      await app.inject({
        url: "/api/milestones",
        headers: { cookie },
      })
    ).json(),
  );
  return { ...state, detail, list };
}

async function _hidesRestrictedAttachmentCountsAndRetainsNull3Stage3(
  state: Readonly<HidesRestrictedAttachmentCountsAndRetainsNull3State2>,
): Promise<HidesRestrictedAttachmentCountsAndRetainsNull3State3> {
  const { cookie, list, database, milestoneId, app } = state;
  expect(list.milestones).toMatchObject([
    { milestone: { milestoneId }, itemCount: 1 },
  ]);
  await database
    .updateTable("milestones")
    .set({ created_by: null })
    .where("id", "=", milestoneId)
    .execute();
  const withoutCreator = await app.inject({
    url: `/api/milestones/${milestoneId}`,
    headers: { cookie },
  });
  expect(withoutCreator.json().createdBy).toBeNull();
  return { ...state, withoutCreator };
}

async function _assertHidesRestrictedAttachmentCountsAndRetainsNullOr3(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _hidesRestrictedAttachmentCountsAndRetainsNull3Stage1(state0);
    const state2 =
      await _hidesRestrictedAttachmentCountsAndRetainsNull3Stage2(state1);
    await _hidesRestrictedAttachmentCountsAndRetainsNull3Stage3(state2);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "hides restricted attachment counts and retains null or another creator metadata",
    _assertHidesRestrictedAttachmentCountsAndRetainsNullOr3,
  );
});
