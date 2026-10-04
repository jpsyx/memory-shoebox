import type { Database } from "../../../../src/db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type DeletesOnlyJoinsReturningVisibleCountAnd5State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type DeletesOnlyJoinsReturningVisibleCountAnd5State1 =
  DeletesOnlyJoinsReturningVisibleCountAnd5State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    sessionId: Awaited<ReturnType<typeof insertSignedInMember>>["sessionId"];
    other: Awaited<ReturnType<typeof insertMember>>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    hiddenRule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    visible: Awaited<ReturnType<typeof insertItem>>;
    hidden: Awaited<ReturnType<typeof insertItem>>;
    before: Array<Selectable<Database["items"]>>;
  };

type DeletesOnlyJoinsReturningVisibleCountAnd5State2 =
  DeletesOnlyJoinsReturningVisibleCountAnd5State1 & {
    deleted: import("fastify").LightMyRequestResponse;
  };

type DeletesOnlyJoinsReturningVisibleCountAnd5State3 =
  DeletesOnlyJoinsReturningVisibleCountAnd5State2 & {
    events: Array<Selectable<Database["activity_events"]>>;
  };

type DeletesOnlyJoinsReturningVisibleCountAnd5State4 =
  DeletesOnlyJoinsReturningVisibleCountAnd5State3;

async function _deletesOnlyJoinsReturningVisibleCountAnd5Stage1(
  state: Readonly<DeletesOnlyJoinsReturningVisibleCountAnd5State0>,
): Promise<DeletesOnlyJoinsReturningVisibleCountAnd5State1> {
  const { database } = state;
  const { cookie, memberId, sessionId } = await insertSignedInMember({
    database,
    session: { device_label: "Milestone phone" },
  });
  const other = await insertMember(database);
  const milestoneId = await insertMilestone(database, {
    name: "Deleted occasion",
    startsOn: "2026-09-01",
    endsOn: "2026-09-03",
  });
  const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
  const visible = await insertItem(database, { uploadedBy: memberId });
  const hidden = await insertItem(database, {
    uploadedBy: other,
    visibility_rule_id: hiddenRule,
    seq: 1,
  });
  await insertItemMilestone(database, { milestoneId, itemId: visible });
  await insertItemMilestone(database, { milestoneId, itemId: hidden });
  const before = await database.selectFrom("items").selectAll().execute();
  return {
    ...state,
    cookie,
    memberId,
    sessionId,
    other,
    milestoneId,
    hiddenRule,
    visible,
    hidden,
    before,
  };
}

async function _deletesOnlyJoinsReturningVisibleCountAnd5Stage2(
  state: Readonly<DeletesOnlyJoinsReturningVisibleCountAnd5State1>,
): Promise<DeletesOnlyJoinsReturningVisibleCountAnd5State2> {
  const { cookie, app, milestoneId, database, before } = state;
  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/milestones/${milestoneId}`,
    headers: { cookie },
  });
  expect(deleted.statusCode).toBe(200);
  expect(deleted.json()).toEqual({
    milestoneId,
    name: "Deleted occasion",
    detachedItemCount: 1,
  });
  expect(await database.selectFrom("items").selectAll().execute()).toEqual(
    before,
  );
  expect(
    await database.selectFrom("pending_object_deletions").selectAll().execute(),
  ).toEqual([]);
  return { ...state, deleted };
}

async function _deletesOnlyJoinsReturningVisibleCountAnd5Stage3(
  state: Readonly<DeletesOnlyJoinsReturningVisibleCountAnd5State2>,
): Promise<DeletesOnlyJoinsReturningVisibleCountAnd5State3> {
  const { database, memberId, sessionId, milestoneId } = state;
  expect(
    await database.selectFrom("item_milestones").selectAll().execute(),
  ).toEqual([]);
  const events = await database
    .selectFrom("activity_events")
    .selectAll()
    .execute();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    kind: "milestone_deleted",
    actor_member_id: memberId,
    actor_label: "Abuela Rosa",
    device_id: sessionId,
    device_label: "Milestone phone",
    subject_kind: "milestone",
    subject_id: milestoneId,
    subject_label: "Deleted occasion",
  });
  return { ...state, events };
}

async function _deletesOnlyJoinsReturningVisibleCountAnd5Stage4(
  state: Readonly<DeletesOnlyJoinsReturningVisibleCountAnd5State3>,
): Promise<DeletesOnlyJoinsReturningVisibleCountAnd5State4> {
  const { events } = state;
  expect(JSON.parse(events[0]!.detail_json!)).toEqual({
    startsOn: "2026-09-01",
    endsOn: "2026-09-03",
    attachmentCount: 2,
  });
  return { ...state };
}

async function _assertDeletesOnlyJoinsReturningVisibleCountAndAuditing5(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _deletesOnlyJoinsReturningVisibleCountAnd5Stage1(state0);
    const state2 =
      await _deletesOnlyJoinsReturningVisibleCountAnd5Stage2(state1);
    const state3 =
      await _deletesOnlyJoinsReturningVisibleCountAnd5Stage3(state2);
    await _deletesOnlyJoinsReturningVisibleCountAnd5Stage4(state3);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "deletes only joins, returning visible count and auditing the true count",
    _assertDeletesOnlyJoinsReturningVisibleCountAndAuditing5,
  );
});
