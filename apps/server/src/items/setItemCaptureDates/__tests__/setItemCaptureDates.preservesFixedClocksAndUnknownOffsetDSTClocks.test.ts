import type { Database } from "../../../db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { getVisibleItemOr404 } from "../../getVisibleItemOr404.ts";
import { setItemCaptureDates } from "../setItemCaptureDates.ts";
import { makeViewer } from "../../../../test/helpers/makeViewer.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  NOW,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";

type PreservesFixedClocksAndUnknownOffsetDST1State0 = {
  database: ReturnType<typeof createDatabase>;
};

type PreservesFixedClocksAndUnknownOffsetDST1State1 =
  PreservesFixedClocksAndUnknownOffsetDST1State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    viewer: ReturnType<typeof makeViewer>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    fixed: Awaited<ReturnType<typeof insertItem>>;
    unknown: Awaited<ReturnType<typeof insertItem>>;
  };

type PreservesFixedClocksAndUnknownOffsetDST1State2 =
  PreservesFixedClocksAndUnknownOffsetDST1State1 & {
    read: (
      itemId: string,
    ) => Promise<
      import(
        "../../getVisibleItemOr404.ts",
        { with: { "resolution-mode": "import" } }
      ).VisibleItem
    >;
  };

type PreservesFixedClocksAndUnknownOffsetDST1State3 =
  PreservesFixedClocksAndUnknownOffsetDST1State2 & {
    changes: Awaited<ReturnType<typeof setItemCaptureDates>>;
  };

type PreservesFixedClocksAndUnknownOffsetDST1State4 =
  PreservesFixedClocksAndUnknownOffsetDST1State3 & {
    rows: Array<Selectable<Database["items"]>>;
  };

type PreservesFixedClocksAndUnknownOffsetDST1State5 =
  PreservesFixedClocksAndUnknownOffsetDST1State4 & {
    history: Array<Selectable<Database["item_capture_date_changes"]>>;
  };

async function _preservesFixedClocksAndUnknownOffsetDST1Stage1(
  state: Readonly<PreservesFixedClocksAndUnknownOffsetDST1State0>,
): Promise<PreservesFixedClocksAndUnknownOffsetDST1State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const viewer = makeViewer({ memberId });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-03-30",
  });
  const fixed = await insertItem(database, {
    uploadedBy: memberId,
    captured_at: "2026-03-28T05:41:32.000Z",
    captured_on: "2026-03-28",
    captured_at_offset_minutes: 60,
    original_captured_at: "2026-03-28T05:41:32.000Z",
  });
  const unknown = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
    captured_at: "2026-03-28T05:41:32.000Z",
    captured_on: "2026-03-28",
    captured_at_offset_minutes: null,
    original_captured_at: "2026-03-28T05:41:32.000Z",
  });
  return { ...state, memberId, viewer, milestoneId, fixed, unknown };
}

async function _preservesFixedClocksAndUnknownOffsetDST1Stage2(
  state: Readonly<PreservesFixedClocksAndUnknownOffsetDST1State1>,
): Promise<PreservesFixedClocksAndUnknownOffsetDST1State2> {
  const { database, viewer } = state;
  const read = (itemId: string) => {
    return getVisibleItemOr404({ database, viewer, itemId });
  };
  return { ...state, read };
}

async function _preservesFixedClocksAndUnknownOffsetDST1Stage3(
  state: Readonly<PreservesFixedClocksAndUnknownOffsetDST1State2>,
): Promise<PreservesFixedClocksAndUnknownOffsetDST1State3> {
  const { milestoneId, viewer, database, read, fixed, unknown } = state;
  const changes = await setItemCaptureDates({
    transaction: database,
    viewer,
    timezone: "Europe/Madrid",
    now: NOW,
    changes: [
      {
        item: await read(fixed),
        capturedOn: "2026-03-30",
        capturedTime: undefined,
        reason: "manual",
        milestoneId: undefined,
      },
      {
        item: await read(unknown),
        capturedOn: "2026-03-30",
        capturedTime: undefined,
        reason: "milestone_reconcile",
        milestoneId,
      },
    ],
  });
  return { ...state, changes };
}

async function _preservesFixedClocksAndUnknownOffsetDST1Stage4(
  state: Readonly<PreservesFixedClocksAndUnknownOffsetDST1State3>,
): Promise<PreservesFixedClocksAndUnknownOffsetDST1State4> {
  const { changes, fixed, unknown, database } = state;
  expect(changes.get(fixed)?.capturedAt).toBe("2026-03-30T05:41:32.000Z");
  expect(changes.get(unknown)?.capturedAt).toBe("2026-03-30T04:41:32.000Z");
  const rows = await database.selectFrom("items").selectAll().execute();
  expect(
    rows.find((row) => {
      return row.id === fixed;
    }),
  ).toMatchObject({
    captured_at_offset_minutes: 60,
    original_captured_at: "2026-03-28T05:41:32.000Z",
    capture_source: "uploader_set",
  });
  expect(
    rows.find((row) => {
      return row.id === unknown;
    }),
  ).toMatchObject({
    captured_at_offset_minutes: null,
    original_captured_at: "2026-03-28T05:41:32.000Z",
    capture_source: "uploader_set",
  });
  return { ...state, rows };
}

async function _preservesFixedClocksAndUnknownOffsetDST1Stage5(
  state: Readonly<PreservesFixedClocksAndUnknownOffsetDST1State4>,
): Promise<PreservesFixedClocksAndUnknownOffsetDST1State5> {
  const { database, unknown, milestoneId, fixed } = state;
  const history = await database
    .selectFrom("item_capture_date_changes")
    .selectAll()
    .execute();
  expect(history).toHaveLength(2);
  expect(
    history.find((row) => {
      return row.item_id === unknown;
    }),
  ).toMatchObject({
    reason: "milestone_reconcile",
    milestone_id: milestoneId,
    previous_captured_at: "2026-03-28T05:41:32.000Z",
    previous_capture_date: "2026-03-28",
    previous_capture_source: "exif",
  });
  expect(
    history.find((row) => {
      return row.item_id === fixed;
    }),
  ).toMatchObject({ reason: "manual", milestone_id: null });
  return { ...state, history };
}

async function _assertPreservesFixedClocksAndUnknownOffsetDSTClocks1(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const state0 = { database };
    const state1 =
      await _preservesFixedClocksAndUnknownOffsetDST1Stage1(state0);
    const state2 =
      await _preservesFixedClocksAndUnknownOffsetDST1Stage2(state1);
    const state3 =
      await _preservesFixedClocksAndUnknownOffsetDST1Stage3(state2);
    const state4 =
      await _preservesFixedClocksAndUnknownOffsetDST1Stage4(state3);
    await _preservesFixedClocksAndUnknownOffsetDST1Stage5(state4);
  } finally {
    await database.destroy();
  }
}
describe("shared batch capture changes", (): void => {
  it(
    "preserves fixed clocks and unknown-offset DST clocks with attributed history and original facts",
    _assertPreservesFixedClocksAndUnknownOffsetDSTClocks1,
  );
});
