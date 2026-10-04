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
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type ValidatesMergedSpansAndClearsAcknowledgementsOnly4State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type ValidatesMergedSpansAndClearsAcknowledgementsOnly4State1 =
  ValidatesMergedSpansAndClearsAcknowledgementsOnly4State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    hiddenRule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hiddenItem: Awaited<ReturnType<typeof insertItem>>;
  };

type ValidatesMergedSpansAndClearsAcknowledgementsOnly4State2 =
  ValidatesMergedSpansAndClearsAcknowledgementsOnly4State1 & {
    patch: (
      payload: object,
    ) => Promise<import("fastify").LightMyRequestResponse>;
    renamed: import("fastify").LightMyRequestResponse;
    rejected: import("fastify").LightMyRequestResponse;
  };

type ValidatesMergedSpansAndClearsAcknowledgementsOnly4State3 =
  ValidatesMergedSpansAndClearsAcknowledgementsOnly4State2 & {
    itemsBefore: Array<Selectable<Database["items"]>>;
    changed: import("fastify").LightMyRequestResponse;
  };

type ValidatesMergedSpansAndClearsAcknowledgementsOnly4State4 =
  ValidatesMergedSpansAndClearsAcknowledgementsOnly4State3;

async function _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage1(
  state: Readonly<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State0>,
): Promise<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State1> {
  const { database } = state;
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "Other creator",
    startsOn: "2026-09-01",
    endsOn: "2026-09-03",
  });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  await insertItemMilestone(database, {
    milestoneId,
    itemId,
    span_mismatch_acknowledged_at: NOW,
  });
  const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
  const hiddenItem = await insertItem(database, {
    uploadedBy: await insertMember(database),
    seq: 1,
    visibility_rule_id: hiddenRule,
  });
  return {
    ...state,
    cookie,
    memberId,
    milestoneId,
    itemId,
    hiddenRule,
    hiddenItem,
  };
}

async function _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage2(
  state: Readonly<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State1>,
): Promise<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State2> {
  const { cookie, database, hiddenItem, app, milestoneId } = state;
  await insertItemMilestone(database, {
    milestoneId,
    itemId: hiddenItem,
    span_mismatch_acknowledged_at: NOW,
  });
  const patch = (payload: object) => {
    return app.inject({
      method: "PATCH",
      url: `/api/milestones/${milestoneId}`,
      headers: { cookie },
      payload,
    });
  };
  const renamed = await patch({
    name: "Renamed",
    blurb: "Updated",
    startsOn: "2026-09-01",
  });
  expect(renamed.statusCode).toBe(200);
  expect(renamed.json().mismatchCount).toBe(0);
  const rejected = await patch({ startsOn: "2026-09-04" });
  expect(rejected.statusCode).toBe(400);
  return { ...state, patch, renamed, rejected };
}

async function _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage3(
  state: Readonly<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State2>,
): Promise<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State3> {
  const { rejected, database, hiddenItem, patch } = state;
  expect(rejected.json().details.fieldErrors.endsOn).toBeDefined();
  expect(
    (await database.selectFrom("item_milestones").selectAll().execute())[0]
      ?.span_mismatch_acknowledged_at,
  ).toBe(NOW);
  expect(
    (
      await database
        .selectFrom("item_milestones")
        .select("span_mismatch_acknowledged_at")
        .where("item_id", "=", hiddenItem)
        .executeTakeFirstOrThrow()
    ).span_mismatch_acknowledged_at,
  ).toBe(NOW);
  const itemsBefore = await database.selectFrom("items").selectAll().execute();
  const changed = await patch({ endsOn: "2026-09-05" });
  expect(changed.json().mismatchCount).toBe(1);
  return { ...state, itemsBefore, changed };
}

async function _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage4(
  state: Readonly<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State3>,
): Promise<ValidatesMergedSpansAndClearsAcknowledgementsOnly4State4> {
  const { database, hiddenItem, itemsBefore } = state;
  expect(
    (await database.selectFrom("item_milestones").selectAll().execute())[0]
      ?.span_mismatch_acknowledged_at,
  ).toBeNull();
  expect(
    (
      await database
        .selectFrom("item_milestones")
        .select("span_mismatch_acknowledged_at")
        .where("item_id", "=", hiddenItem)
        .executeTakeFirstOrThrow()
    ).span_mismatch_acknowledged_at,
  ).toBeNull();
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

async function _assertValidatesMergedSpansAndClearsAcknowledgementsOnlyFor4(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 =
      await _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage1(state0);
    const state2 =
      await _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage2(state1);
    const state3 =
      await _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage3(state2);
    await _validatesMergedSpansAndClearsAcknowledgementsOnly4Stage4(state3);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "validates merged spans and clears acknowledgements only for actual date changes",
    _assertValidatesMergedSpansAndClearsAcknowledgementsOnlyFor4,
  );
});
