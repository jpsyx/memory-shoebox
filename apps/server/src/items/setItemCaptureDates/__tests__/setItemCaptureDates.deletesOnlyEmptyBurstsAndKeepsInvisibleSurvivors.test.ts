import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { getVisibleItemOr404 } from "../../getVisibleItemOr404.ts";
import {
  setItemCaptureDates,
  type CaptureDateTarget,
} from "../setItemCaptureDates.ts";
import { makeViewer } from "../../../../test/helpers/makeViewer.ts";
import {
  insertItem,
  insertMember,
  insertBurst,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";

type DeletesOnlyEmptyBurstsAndKeepsInvisible3State0 = {
  database: ReturnType<typeof createDatabase>;
};

type DeletesOnlyEmptyBurstsAndKeepsInvisible3State1 =
  DeletesOnlyEmptyBurstsAndKeepsInvisible3State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    other: Awaited<ReturnType<typeof insertMember>>;
    viewer: ReturnType<typeof makeViewer>;
    uploadSessionId: Awaited<ReturnType<typeof insertUploadSession>>;
    shared: Awaited<ReturnType<typeof insertBurst>>;
    empty: Awaited<ReturnType<typeof insertBurst>>;
    first: Awaited<ReturnType<typeof insertItem>>;
  };

type DeletesOnlyEmptyBurstsAndKeepsInvisible3State2 =
  DeletesOnlyEmptyBurstsAndKeepsInvisible3State1 & {
    second: Awaited<ReturnType<typeof insertItem>>;
    rule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hidden: Awaited<ReturnType<typeof insertItem>>;
    changes: Array<
      import(
        "../setItemCaptureDates.ts",
        { with: { "resolution-mode": "import" } }
      ).CaptureDateTarget
    >;
  };

type DeletesOnlyEmptyBurstsAndKeepsInvisible3State3 =
  DeletesOnlyEmptyBurstsAndKeepsInvisible3State2 & {
    results: Awaited<ReturnType<typeof setItemCaptureDates>>;
  };

type DeletesOnlyEmptyBurstsAndKeepsInvisible3State4 =
  DeletesOnlyEmptyBurstsAndKeepsInvisible3State3;

async function _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage1(
  state: Readonly<DeletesOnlyEmptyBurstsAndKeepsInvisible3State0>,
): Promise<DeletesOnlyEmptyBurstsAndKeepsInvisible3State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const other = await insertMember(database);
  const viewer = makeViewer({ memberId });
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const shared = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  const empty = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  const first = await insertItem(database, {
    uploadedBy: memberId,
    burst_id: shared,
    burst_index: 0,
  });
  return {
    ...state,
    memberId,
    other,
    viewer,
    uploadSessionId,
    shared,
    empty,
    first,
  };
}

async function _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage2(
  state: Readonly<DeletesOnlyEmptyBurstsAndKeepsInvisible3State1>,
): Promise<DeletesOnlyEmptyBurstsAndKeepsInvisible3State2> {
  const { database, memberId, empty, other, shared } = state;
  const second = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
    burst_id: empty,
    burst_index: 0,
  });
  const rule = await insertVisibilityRule(database, { mode: "only" });
  const hidden = await insertItem(database, {
    uploadedBy: other,
    seq: 2,
    burst_id: shared,
    burst_index: 7,
    visibility_rule_id: rule,
  });
  const changes: CaptureDateTarget[] = [];
  return { ...state, second, rule, hidden, changes };
}

async function _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage3(
  state: Readonly<DeletesOnlyEmptyBurstsAndKeepsInvisible3State2>,
): Promise<DeletesOnlyEmptyBurstsAndKeepsInvisible3State3> {
  const { viewer, first, second, changes, database } = state;
  for (const itemId of [first, second]) {
    changes.push({
      item: await getVisibleItemOr404({ database, viewer, itemId }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      reason: "manual" as const,
      milestoneId: undefined,
    });
  }
  const results = await setItemCaptureDates({
    transaction: database,
    viewer,
    changes,
    timezone: "Europe/Madrid",
    now: NOW,
  });
  expect([...results.values()]).toMatchObject([
    { burstId: undefined, burstIndex: undefined },
    { burstId: undefined, burstIndex: undefined },
  ]);
  return { ...state, results };
}

async function _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage4(
  state: Readonly<DeletesOnlyEmptyBurstsAndKeepsInvisible3State3>,
): Promise<DeletesOnlyEmptyBurstsAndKeepsInvisible3State4> {
  const { database, shared, hidden } = state;
  expect(await database.selectFrom("bursts").select("id").execute()).toEqual([
    { id: shared },
  ]);
  expect(
    await database
      .selectFrom("items")
      .select(["burst_id", "burst_index"])
      .where("id", "=", hidden)
      .executeTakeFirstOrThrow(),
  ).toEqual({ burst_id: shared, burst_index: 7 });
  return { ...state };
}

async function _assertDeletesOnlyEmptyBurstsAndKeepsInvisibleSurvivors3(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const state0 = { database };
    const state1 =
      await _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage1(state0);
    const state2 =
      await _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage2(state1);
    const state3 =
      await _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage3(state2);
    await _deletesOnlyEmptyBurstsAndKeepsInvisible3Stage4(state3);
  } finally {
    await database.destroy();
  }
}
describe("shared batch capture changes", (): void => {
  it(
    "deletes only empty bursts and keeps invisible survivors and their indexes",
    _assertDeletesOnlyEmptyBurstsAndKeepsInvisibleSurvivors3,
  );
});
