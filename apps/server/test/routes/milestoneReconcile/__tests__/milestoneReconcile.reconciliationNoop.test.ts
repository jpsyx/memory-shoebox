import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMilestone,
  insertItemMilestone,
  insertInstanceSetting,
  insertBurst,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type SeedReconciliationNoopResult = {
  cookie: string;
  milestoneId: string;
  itemId: string;
  burstId: string;
};

type AssertNoopReconciliationRowsOptions = {
  database: TestApp["database"];
  capturedAt: string;
  itemId: string;
  burstId: string;
};

async function _seedReconciliationNoop(
  options: Readonly<{
    database: TestApp["database"];
    capturedAt: string;
  }>,
): Promise<SeedReconciliationNoopResult> {
  const { database, capturedAt } = options;
  const { cookie, memberId } = await insertSignedInMember({ database });
  await insertInstanceSetting(database, {
    key: "shoebox.timezone",
    value: "America/New_York",
  });
  const milestoneId = await insertMilestone(database, {
    name: "Fallback",
    startsOn: "2026-11-01",
  });
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-11-01",
  });
  const itemId = await insertItem(database, {
    uploadedBy: memberId,
    captured_at: capturedAt,
    captured_on: "2026-11-01",
    captured_at_offset_minutes: null,
    original_captured_at: capturedAt,
    burst_id: burstId,
    burst_index: 7,
  });
  await insertItemMilestone(database, { itemId, milestoneId });
  return { cookie, milestoneId, itemId, burstId };
}

async function _assertNoopReconciliationRows(
  options: Readonly<AssertNoopReconciliationRowsOptions>,
): Promise<void> {
  const { database, capturedAt, itemId, burstId } = options;
  expect(
    await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow(),
  ).toMatchObject({
    captured_at: capturedAt,
    captured_on: "2026-11-01",
    captured_at_offset_minutes: null,
    original_captured_at: capturedAt,
    capture_source: "exif",
    burst_id: burstId,
    burst_index: 7,
  });
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toEqual([]);
  expect(await database.selectFrom("bursts").select("id").execute()).toEqual([
    { id: burstId },
  ]);
}

async function _assertReconciliationNoop(capturedAt: string): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, milestoneId, itemId, burstId } =
      await _seedReconciliationNoop({ database, capturedAt });
    const response = await app.inject({
      method: "POST",
      url: `/api/milestones/${milestoneId}/reconcile`,
      headers: { cookie },
      payload: {
        mode: "move",
        moves: [{ itemId, targetOn: "2026-11-01" }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      movedCount: 0,
      raisedElsewhere: [],
    });
    await _assertNoopReconciliationRows({
      database,
      capturedAt,
      itemId,
      burstId,
    });
  } finally {
    await close();
  }
}
describe("milestone reconciliation boundary", (): void => {
  it.each(["2026-11-01T06:30:00.000Z", "2026-11-01T06:30:00.123Z"])(
    "preserves the exact repeated DST instant %s on a day-only no-op",
    _assertReconciliationNoop,
  );
});
