import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { getVisibleItemOr404 } from "../../getVisibleItemOr404.ts";
import { setItemCaptureDates } from "../setItemCaptureDates.ts";
import { makeViewer } from "../../../../test/helpers/makeViewer.ts";
import {
  insertItem,
  insertMember,
  NOW,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";

type AppliesAnExplicitManualClockChangeOn2State0 = {
  database: ReturnType<typeof createDatabase>;
};

type AppliesAnExplicitManualClockChangeOn2State1 =
  AppliesAnExplicitManualClockChangeOn2State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    viewer: ReturnType<typeof makeViewer>;
    originalInstant: "2026-11-01T06:30:00.123Z";
    itemId: Awaited<ReturnType<typeof insertItem>>;
  };

type AppliesAnExplicitManualClockChangeOn2State2 =
  AppliesAnExplicitManualClockChangeOn2State1 & {
    changes: Awaited<ReturnType<typeof setItemCaptureDates>>;
  };

type AppliesAnExplicitManualClockChangeOn2State3 =
  AppliesAnExplicitManualClockChangeOn2State2;

type AppliesAnExplicitManualClockChangeOn2State4 =
  AppliesAnExplicitManualClockChangeOn2State3;

async function _appliesAnExplicitManualClockChangeOn2Stage1(
  state: Readonly<AppliesAnExplicitManualClockChangeOn2State0>,
): Promise<AppliesAnExplicitManualClockChangeOn2State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const viewer = makeViewer({ memberId });
  const originalInstant = "2026-11-01T06:30:00.123Z";
  const itemId = await insertItem(database, {
    uploadedBy: memberId,
    captured_at: originalInstant,
    captured_on: "2026-11-01",
    captured_at_offset_minutes: null,
    original_captured_at: originalInstant,
  });
  return { ...state, memberId, viewer, originalInstant, itemId };
}

async function _appliesAnExplicitManualClockChangeOn2Stage2(
  state: Readonly<AppliesAnExplicitManualClockChangeOn2State1>,
): Promise<AppliesAnExplicitManualClockChangeOn2State2> {
  const { viewer, database, itemId } = state;
  const changes = await setItemCaptureDates({
    transaction: database,
    viewer,
    timezone: "America/New_York",
    now: NOW,
    changes: [
      {
        item: await getVisibleItemOr404({ database, viewer, itemId }),
        capturedOn: "2026-11-01",
        capturedTime: "02:45",
        reason: "manual",
        milestoneId: undefined,
      },
    ],
  });
  expect(changes.get(itemId)).toMatchObject({
    didChange: true,
    capturedAt: "2026-11-01T07:45:00.000Z",
    captureSource: "uploader_set",
  });
  return { ...state, changes };
}

async function _appliesAnExplicitManualClockChangeOn2Stage3(
  state: Readonly<AppliesAnExplicitManualClockChangeOn2State2>,
): Promise<AppliesAnExplicitManualClockChangeOn2State3> {
  const { database, itemId, originalInstant } = state;
  expect(
    await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow(),
  ).toMatchObject({
    captured_at: "2026-11-01T07:45:00.000Z",
    captured_on: "2026-11-01",
    captured_at_offset_minutes: null,
    original_captured_at: originalInstant,
  });
  return { ...state };
}

async function _appliesAnExplicitManualClockChangeOn2Stage4(
  state: Readonly<AppliesAnExplicitManualClockChangeOn2State3>,
): Promise<AppliesAnExplicitManualClockChangeOn2State4> {
  const { database, originalInstant } = state;
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toMatchObject([
    {
      reason: "manual",
      milestone_id: null,
      previous_captured_at: originalInstant,
      new_captured_at: "2026-11-01T07:45:00.000Z",
    },
  ]);
  return { ...state };
}

async function _assertAppliesAnExplicitManualClockChangeOnAn2(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const state0 = { database };
    const state1 = await _appliesAnExplicitManualClockChangeOn2Stage1(state0);
    const state2 = await _appliesAnExplicitManualClockChangeOn2Stage2(state1);
    const state3 = await _appliesAnExplicitManualClockChangeOn2Stage3(state2);
    await _appliesAnExplicitManualClockChangeOn2Stage4(state3);
  } finally {
    await database.destroy();
  }
}
describe("shared batch capture changes", (): void => {
  it(
    "applies an explicit manual clock change on an unchanged fallback day",
    _assertAppliesAnExplicitManualClockChangeOnAn2,
  );
});
