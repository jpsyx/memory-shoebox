import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertItem,
  insertMilestone,
  insertItemMilestone,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _seedReconciliationHistory(
  database: TestApp["database"],
): Promise<{
  cookie: string;
  milestoneId: string;
  itemId: string;
}> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-20",
  });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  await insertItemMilestone(database, { itemId, milestoneId });
  return { cookie, milestoneId, itemId };
}

async function _assertStoredReconciliationHistory(
  options: Readonly<{
    database: TestApp["database"];
    milestoneId: string;
    move: () => Promise<import("fastify").LightMyRequestResponse>;
  }>,
): Promise<void> {
  const { database, move, milestoneId } = options;
  const history = await database
    .selectFrom("item_capture_date_changes")
    .selectAll()
    .execute();
  expect(history).toMatchObject([
    {
      reason: "milestone_reconcile",
      milestone_id: milestoneId,
      previous_captured_at: NOW,
      previous_capture_date: "2026-09-27",
      previous_capture_source: "exif",
    },
  ]);
  expect((await move()).json()).toMatchObject({ movedCount: 0 });
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toEqual(history);
}

async function _assertReconciliationHistory(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, milestoneId, itemId } =
      await _seedReconciliationHistory(database);
    const move = () => {
      return app.inject({
        method: "POST",
        url: `/api/milestones/${milestoneId}/reconcile`,
        headers: { cookie },
        payload: {
          mode: "move",
          moves: [{ itemId, targetOn: "2026-09-20" }],
        },
      });
    };
    const response = await move();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      movedCount: 1,
      acknowledgedCount: 0,
      mismatchCount: 0,
      raisedElsewhere: [],
    });
    await _assertStoredReconciliationHistory({ database, move, milestoneId });
  } finally {
    await close();
  }
}
describe("milestone reconciliation boundary", (): void => {
  it(
    "moves an attachment with reconciliation history and counts only actual moves",
    _assertReconciliationHistory,
  );
});
