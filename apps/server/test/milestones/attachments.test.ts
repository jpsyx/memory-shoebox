import type { Database } from "../../src/db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

type AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State1 =
  AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    other: Awaited<ReturnType<typeof insertMember>>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    hiddenRule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hiddenId: Awaited<ReturnType<typeof insertItem>>;
    hiddenAttachment: Selectable<Database["item_milestones"]>;
  };
type AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State2 =
  AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State1 & {
    itemsBefore: Array<Selectable<Database["items"]>>;
    delta: (
      attach: string[],
      detach: string[],
    ) => Promise<import("fastify").LightMyRequestResponse>;
    attached: import("fastify").LightMyRequestResponse;
  };
type AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State3 =
  AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State2 & {
    beforeDuplicate: Array<Selectable<Database["item_milestones"]>>;
  };
type AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State4 =
  AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State3;

type MakesInaccessibleDetachByteIdenticalToNonexistent2State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type MakesInaccessibleDetachByteIdenticalToNonexistent2State1 =
  MakesInaccessibleDetachByteIdenticalToNonexistent2State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    other: Awaited<ReturnType<typeof insertMember>>;
    rule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hidden: Awaited<ReturnType<typeof insertItem>>;
    visible: Awaited<ReturnType<typeof insertItem>>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    before: Array<Selectable<Database["item_milestones"]>>;
  };
type MakesInaccessibleDetachByteIdenticalToNonexistent2State2 =
  MakesInaccessibleDetachByteIdenticalToNonexistent2State1 & {
    delta: (
      detachId: string,
    ) => Promise<import("fastify").LightMyRequestResponse>;
    rejected: import("fastify").LightMyRequestResponse;
    nonexistent: import("fastify").LightMyRequestResponse;
  };
type MakesInaccessibleDetachByteIdenticalToNonexistent2State3 =
  MakesInaccessibleDetachByteIdenticalToNonexistent2State2 & {
    failedCreate: import("fastify").LightMyRequestResponse;
  };

async function _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage1(
  state: Readonly<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State0>,
): Promise<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State1> {
  const { database } = state;
  const { cookie, memberId } = await insertSignedInMember({ database });
  const other = await insertMember(database);
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-01",
  });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
  const hiddenId = await insertItem(database, {
    uploadedBy: other,
    seq: 1,
    visibility_rule_id: hiddenRule,
  });
  await insertItemMilestone(database, { itemId: hiddenId, milestoneId });
  const hiddenAttachment = await database
    .selectFrom("item_milestones")
    .selectAll()
    .where("item_id", "=", hiddenId)
    .executeTakeFirstOrThrow();
  return {
    ...state,
    cookie,
    memberId,
    other,
    milestoneId,
    itemId,
    hiddenRule,
    hiddenId,
    hiddenAttachment,
  };
}

async function _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage2(
  state: Readonly<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State1>,
): Promise<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State2> {
  const { cookie, database, app, milestoneId, itemId } = state;
  const itemsBefore = await database.selectFrom("items").selectAll().execute();
  const delta = (attach: string[], detach: string[]) => {
    return app.inject({
      method: "PATCH",
      url: `/api/milestones/${milestoneId}/items`,
      headers: { cookie },
      payload: { attach, detach },
    });
  };
  const attached = await delta([itemId], []);
  expect(attached.statusCode).toBe(200);
  expect(attached.json()).toMatchObject({
    attachedCount: 1,
    detachedCount: 0,
    itemCount: 1,
    mismatchCount: 1,
  });
  return { ...state, itemsBefore, delta, attached };
}

async function _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage3(
  state: Readonly<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State2>,
): Promise<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State3> {
  const { database, itemId, delta } = state;
  await database
    .updateTable("item_milestones")
    .set({ span_mismatch_acknowledged_at: "2026-09-25T00:00:00.000Z" })
    .where("item_id", "=", itemId)
    .execute();
  const beforeDuplicate = await database
    .selectFrom("item_milestones")
    .selectAll()
    .execute();
  expect((await delta([itemId], [])).json()).toMatchObject({
    attachedCount: 0,
    detachedCount: 0,
  });
  expect(
    await database.selectFrom("item_milestones").selectAll().execute(),
  ).toEqual(beforeDuplicate);
  expect((await delta([], [itemId])).json()).toMatchObject({
    attachedCount: 0,
    detachedCount: 1,
  });
  return { ...state, beforeDuplicate };
}

async function _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage4(
  state: Readonly<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State3>,
): Promise<AttachesAndDetachesIdempotentlyPreservingExistingMetadata1State4> {
  const { delta, itemId, database, hiddenAttachment, itemsBefore } = state;
  expect((await delta([], [itemId])).json()).toMatchObject({
    attachedCount: 0,
    detachedCount: 0,
  });
  expect(
    await database.selectFrom("item_milestones").selectAll().execute(),
  ).toContainEqual(hiddenAttachment);
  expect(await database.selectFrom("items").selectAll().execute()).toEqual(
    itemsBefore,
  );
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toEqual([]);
  return { ...state };
}

async function _makesInaccessibleDetachByteIdenticalToNonexistent2Stage1(
  state: Readonly<MakesInaccessibleDetachByteIdenticalToNonexistent2State0>,
): Promise<MakesInaccessibleDetachByteIdenticalToNonexistent2State1> {
  const { database } = state;
  const { cookie, memberId } = await insertSignedInMember({ database });
  const other = await insertMember(database);
  const rule = await insertVisibilityRule(database, { mode: "only" });
  const hidden = await insertItem(database, {
    uploadedBy: other,
    visibility_rule_id: rule,
  });
  const visible = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
  });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-01",
  });
  await insertItemMilestone(database, { milestoneId, itemId: hidden });
  const before = await database
    .selectFrom("item_milestones")
    .selectAll()
    .execute();
  return {
    ...state,
    cookie,
    memberId,
    other,
    rule,
    hidden,
    visible,
    milestoneId,
    before,
  };
}

async function _makesInaccessibleDetachByteIdenticalToNonexistent2Stage2(
  state: Readonly<MakesInaccessibleDetachByteIdenticalToNonexistent2State1>,
): Promise<MakesInaccessibleDetachByteIdenticalToNonexistent2State2> {
  const { cookie, app, milestoneId, visible, hidden, database, before } = state;
  const delta = (detachId: string) => {
    return app.inject({
      method: "PATCH",
      url: `/api/milestones/${milestoneId}/items`,
      headers: { cookie },
      payload: { attach: [visible], detach: [detachId] },
    });
  };
  const rejected = await delta(hidden);
  const nonexistent = await delta(createId());
  expect(rejected.statusCode).toBe(404);
  expect(rejected.json().error).toBe("item_not_found");
  expect(rejected.body).toBe(nonexistent.body);
  expect(
    await database.selectFrom("item_milestones").selectAll().execute(),
  ).toEqual(before);
  return { ...state, delta, rejected, nonexistent };
}

async function _makesInaccessibleDetachByteIdenticalToNonexistent2Stage3(
  state: Readonly<MakesInaccessibleDetachByteIdenticalToNonexistent2State2>,
): Promise<MakesInaccessibleDetachByteIdenticalToNonexistent2State3> {
  const { cookie, app, visible, hidden, rejected, database } = state;
  const failedCreate = await app.inject({
    method: "POST",
    url: "/api/milestones",
    headers: { cookie },
    payload: {
      name: "not inserted",
      startsOn: "2026-09-01",
      endsOn: "2026-09-01",
      blurb: null,
      itemIds: [visible, hidden],
    },
  });
  expect(failedCreate.body).toBe(rejected.body);
  expect(
    await database.selectFrom("milestones").select("name").execute(),
  ).toEqual([{ name: "occasion" }]);
  return { ...state, failedCreate };
}

async function _assertAttachesAndDetachesIdempotentlyPreservingExistingMetadataHidden1(): Promise<void> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  try {
    const state0 = { app, database, close };
    const state1 =
      await _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage1(
        state0,
      );
    const state2 =
      await _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage2(
        state1,
      );
    const state3 =
      await _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage3(
        state2,
      );
    await _attachesAndDetachesIdempotentlyPreservingExistingMetadata1Stage4(
      state3,
    );
  } finally {
    await close();
  }
}

async function _assertMakesInaccessibleDetachByteIdenticalToNonexistentAnd2(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _makesInaccessibleDetachByteIdenticalToNonexistent2Stage1(state0);
    const state2 =
      await _makesInaccessibleDetachByteIdenticalToNonexistent2Stage2(state1);
    await _makesInaccessibleDetachByteIdenticalToNonexistent2Stage3(state2);
  } finally {
    await close();
  }
}
describe("milestone attachment deltas", () => {
  it(
    "attaches and detaches idempotently, preserving existing metadata, hidden joins, and item facts",
    _assertAttachesAndDetachesIdempotentlyPreservingExistingMetadataHidden1,
  );

  it(
    "makes inaccessible detach byte-identical to nonexistent and rolls back an accessible attach",
    _assertMakesInaccessibleDetachByteIdenticalToNonexistentAnd2,
  );
});
