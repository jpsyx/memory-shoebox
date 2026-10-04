import type { LightMyRequestResponse } from "fastify";
import type { Selectable } from "kysely";
import type { Database } from "../../../../src/db/types/db.types.ts";
import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { createId } from "../../../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type SeedReconciliationVisibilityResult = {
  cookie: string;
  milestoneId: string;
  attached: string;
  unattached: string;
  hidden: string;
  before: Array<Selectable<Database["items"]>>;
};

type AssertRejectedReconciliationMovesOptions = {
  milestoneId: string;
  database: TestApp["database"];
  move: (itemId: string, targetOn?: string) => Promise<LightMyRequestResponse>;
  hidden: string;
  unattached: string;
};

async function _seedReconciliationVisibility(
  database: TestApp["database"],
): Promise<SeedReconciliationVisibilityResult> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-20",
  });
  const attached = await insertItem(database, { uploadedBy: memberId });
  await insertItemMilestone(database, { itemId: attached, milestoneId });
  const unattached = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
  });
  const other = await insertMember(database);
  const rule = await insertVisibilityRule(database, { mode: "only" });
  const hidden = await insertItem(database, {
    uploadedBy: other,
    seq: 2,
    visibility_rule_id: rule,
  });
  const before = await database.selectFrom("items").selectAll().execute();
  return { cookie, milestoneId, attached, unattached, hidden, before };
}

async function _assertRejectedReconciliationMoves(
  options: Readonly<AssertRejectedReconciliationMovesOptions>,
): Promise<void> {
  const { database, milestoneId, move, hidden, unattached } = options;
  const hiddenResponse = await move(hidden);
  expect(hiddenResponse.statusCode).toBe(404);
  expect(hiddenResponse.json().error).toBe("item_not_found");
  expect(hiddenResponse.body).toBe((await move(createId())).body);
  const missingAttachment = await move(unattached);
  expect(missingAttachment.statusCode).toBe(409);
  expect(missingAttachment.json().error).toBe("milestone_attachment_missing");
  await insertItemMilestone(database, { itemId: unattached, milestoneId });
  const outside = await move(unattached, "2026-09-21");
  expect(outside.statusCode).toBe(400);
  expect(outside.json().details.fieldErrors["moves.1.targetOn"]).toBeDefined();
}

async function _assertUnchangedReconciliationRows(
  options: Readonly<{
    database: TestApp["database"];
    before: Array<Selectable<Database["items"]>>;
  }>,
): Promise<void> {
  const { database, before } = options;
  expect(await database.selectFrom("items").selectAll().execute()).toEqual(
    before,
  );
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toEqual([]);
}

async function _assertReconciliationVisibility(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, milestoneId, attached, unattached, hidden, before } =
      await _seedReconciliationVisibility(database);
    const move = (itemId: string, targetOn = "2026-09-20") => {
      return app.inject({
        method: "POST",
        url: `/api/milestones/${milestoneId}/reconcile`,
        headers: { cookie },
        payload: {
          mode: "move",
          moves: [
            { itemId: attached, targetOn: "2026-09-20" },
            { itemId, targetOn },
          ],
        },
      });
    };
    await _assertRejectedReconciliationMoves({
      database,
      milestoneId,
      move,
      hidden,
      unattached,
    });
    await _assertUnchangedReconciliationRows({ database, before });
  } finally {
    await close();
  }
}
describe("milestone reconciliation boundary", (): void => {
  it(
    "validates visibility and attachment membership across the whole batch before writing",
    _assertReconciliationVisibility,
  );
});
