import { describe, expect, it } from "vitest";
import { createDatabase } from "../../db/client.ts";
import { migrateToLatest } from "../../db/migrate.ts";
import { reconcileMilestone } from "./reconcileMilestone.ts";
import { makeViewer } from "../../../test/helpers/makeViewer.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../../test/helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
  insertUploadSession,
  insertBurst,
  NOW,
} from "../../../test/helpers/seedHelpers/seedHelpers.ts";

type RearmsOtherSpansAndReportsFullVisible1State0 = {
  database: ReturnType<typeof createDatabase>;
};
type RearmsOtherSpansAndReportsFullVisible1State1 =
  RearmsOtherSpansAndReportsFullVisible1State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    viewer: ReturnType<typeof makeViewer>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    otherId: Awaited<ReturnType<typeof insertMilestone>>;
    untouchedId: Awaited<ReturnType<typeof insertMilestone>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
    acknowledgedAt: "2026-09-01T00:00:00.000Z";
  };
type RearmsOtherSpansAndReportsFullVisible1State2 =
  RearmsOtherSpansAndReportsFullVisible1State1 & {
    visible: Awaited<ReturnType<typeof insertItem>>;
  };
type RearmsOtherSpansAndReportsFullVisible1State3 =
  RearmsOtherSpansAndReportsFullVisible1State2 & {
    acknowledged: Awaited<ReturnType<typeof insertItem>>;
    rule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    hidden: Awaited<ReturnType<typeof insertItem>>;
  };
type RearmsOtherSpansAndReportsFullVisible1State4 =
  RearmsOtherSpansAndReportsFullVisible1State3 & {
    result: Awaited<ReturnType<typeof reconcileMilestone>>;
  };
type RearmsOtherSpansAndReportsFullVisible1State5 =
  RearmsOtherSpansAndReportsFullVisible1State4;

type UsesConstantQueryCountsForOneVersus2State0 = {
  database: ReturnType<typeof createDatabase>;
};
type UsesConstantQueryCountsForOneVersus2State1 =
  UsesConstantQueryCountsForOneVersus2State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    viewer: ReturnType<typeof makeViewer>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    uploadSessionId: Awaited<ReturnType<typeof insertUploadSession>>;
    moves: Array<{ itemId: string; targetOn: string }>;
  };
type UsesConstantQueryCountsForOneVersus2State2 =
  UsesConstantQueryCountsForOneVersus2State1;
type UsesConstantQueryCountsForOneVersus2State3 =
  UsesConstantQueryCountsForOneVersus2State2 & {
    counter: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
    context: {
      transaction: import(
        "kysely",
        { with: { "resolution-mode": "import" } }
      ).Kysely<
        import(
          "../../db/types/db.types.ts",
          { with: { "resolution-mode": "import" } }
        ).Database
      >;
      viewer: import(
        "../../http/requestContextHelpers.ts",
        { with: { "resolution-mode": "import" } }
      ).Viewer;
      milestoneId: string;
      now: string;
    };
    small: Awaited<ReturnType<typeof reconcileMilestone>>;
    smallCount: number;
    large: Awaited<ReturnType<typeof reconcileMilestone>>;
  };
type UsesConstantQueryCountsForOneVersus2State4 =
  UsesConstantQueryCountsForOneVersus2State3;

async function _rearmsOtherSpansAndReportsFullVisible1Stage1(
  state: Readonly<RearmsOtherSpansAndReportsFullVisible1State0>,
): Promise<RearmsOtherSpansAndReportsFullVisible1State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const viewer = makeViewer({ memberId });
  const milestoneId = await insertMilestone(database, {
    name: "target",
    startsOn: "2026-09-20",
  });
  const otherId = await insertMilestone(database, {
    name: "other",
    startsOn: "2026-09-27",
  });
  const untouchedId = await insertMilestone(database, {
    name: "still contains",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
  });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const acknowledgedAt = "2026-09-01T00:00:00.000Z";
  await insertItemMilestone(database, { itemId, milestoneId });
  return {
    ...state,
    memberId,
    viewer,
    milestoneId,
    otherId,
    untouchedId,
    itemId,
    acknowledgedAt,
  };
}

async function _rearmsOtherSpansAndReportsFullVisible1Stage2(
  state: Readonly<RearmsOtherSpansAndReportsFullVisible1State1>,
): Promise<RearmsOtherSpansAndReportsFullVisible1State2> {
  const { itemId, database, otherId, acknowledgedAt, untouchedId, memberId } =
    state;
  await insertItemMilestone(database, {
    itemId,
    milestoneId: otherId,
    span_mismatch_acknowledged_at: acknowledgedAt,
  });
  await insertItemMilestone(database, {
    itemId,
    milestoneId: untouchedId,
    span_mismatch_acknowledged_at: acknowledgedAt,
  });
  const visible = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
    captured_on: "2026-09-19",
  });
  await insertItemMilestone(database, {
    itemId: visible,
    milestoneId: otherId,
  });
  return { ...state, visible };
}

async function _rearmsOtherSpansAndReportsFullVisible1Stage3(
  state: Readonly<RearmsOtherSpansAndReportsFullVisible1State2>,
): Promise<RearmsOtherSpansAndReportsFullVisible1State3> {
  const { database, memberId, otherId, acknowledgedAt } = state;
  const acknowledged = await insertItem(database, {
    uploadedBy: memberId,
    seq: 2,
    captured_on: "2026-09-19",
  });
  await insertItemMilestone(database, {
    itemId: acknowledged,
    milestoneId: otherId,
    span_mismatch_acknowledged_at: acknowledgedAt,
  });
  const rule = await insertVisibilityRule(database, { mode: "only" });
  const hidden = await insertItem(database, {
    uploadedBy: await insertMember(database),
    seq: 3,
    captured_on: "2026-09-19",
    visibility_rule_id: rule,
  });
  await insertItemMilestone(database, {
    itemId: hidden,
    milestoneId: otherId,
  });
  return { ...state, acknowledged, rule, hidden };
}

async function _rearmsOtherSpansAndReportsFullVisible1Stage4(
  state: Readonly<RearmsOtherSpansAndReportsFullVisible1State3>,
): Promise<RearmsOtherSpansAndReportsFullVisible1State4> {
  const { itemId, milestoneId, viewer, database, otherId } = state;
  const result = await reconcileMilestone({
    transaction: database,
    viewer,
    milestoneId,
    now: NOW,
    body: { mode: "move", moves: [{ itemId, targetOn: "2026-09-20" }] },
  });
  expect(result.raisedElsewhere).toEqual([
    {
      milestone: {
        milestoneId: otherId,
        name: "other",
        startsOn: "2026-09-27",
        endsOn: "2026-09-27",
        blurb: null,
      },
      mismatchCount: 2,
    },
  ]);
  return { ...state, result };
}

async function _rearmsOtherSpansAndReportsFullVisible1Stage5(
  state: Readonly<RearmsOtherSpansAndReportsFullVisible1State4>,
): Promise<RearmsOtherSpansAndReportsFullVisible1State5> {
  const { database, itemId, otherId, untouchedId, acknowledgedAt } = state;
  expect(
    await database
      .selectFrom("item_milestones")
      .select("span_mismatch_acknowledged_at")
      .where("item_id", "=", itemId)
      .where("milestone_id", "=", otherId)
      .executeTakeFirstOrThrow(),
  ).toEqual({ span_mismatch_acknowledged_at: null });
  expect(
    await database
      .selectFrom("item_milestones")
      .select("span_mismatch_acknowledged_at")
      .where("item_id", "=", itemId)
      .where("milestone_id", "=", untouchedId)
      .executeTakeFirstOrThrow(),
  ).toEqual({ span_mismatch_acknowledged_at: acknowledgedAt });
  return { ...state };
}

async function _usesConstantQueryCountsForOneVersus2Stage1(
  state: Readonly<UsesConstantQueryCountsForOneVersus2State0>,
): Promise<UsesConstantQueryCountsForOneVersus2State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const viewer = makeViewer({ memberId });
  const milestoneId = await insertMilestone(database, {
    name: "target",
    startsOn: "2026-09-20",
  });
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const moves: Array<{ itemId: string; targetOn: string }> = [];
  return { ...state, memberId, viewer, milestoneId, uploadSessionId, moves };
}

async function _usesConstantQueryCountsForOneVersus2Stage2(
  state: Readonly<UsesConstantQueryCountsForOneVersus2State1>,
): Promise<UsesConstantQueryCountsForOneVersus2State2> {
  const { milestoneId, uploadSessionId, database, memberId, moves } = state;
  for (let index = 0; index < 501; index += 1) {
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-27",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: index,
      burst_id: burstId,
      burst_index: 0,
    });
    await insertItemMilestone(database, { itemId, milestoneId });
    const otherId = await insertMilestone(database, {
      name: `other ${index}`,
      startsOn: "2026-09-27",
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId: otherId,
      span_mismatch_acknowledged_at: NOW,
    });
    moves.push({ itemId, targetOn: "2026-09-20" });
  }
  return { ...state };
}

async function _usesConstantQueryCountsForOneVersus2Stage3(
  state: Readonly<UsesConstantQueryCountsForOneVersus2State2>,
): Promise<UsesConstantQueryCountsForOneVersus2State3> {
  const { milestoneId, viewer, database, moves } = state;
  const counter = makeQueryCountingDatabaseFromDatabase(database);
  const context = {
    transaction: counter.database,
    viewer,
    milestoneId,
    now: NOW,
  };
  const small = await reconcileMilestone({
    ...context,
    body: { mode: "move", moves: moves.slice(0, 1) },
  });
  const smallCount = counter.getQueryCount();
  counter.reset();
  const large = await reconcileMilestone({
    ...context,
    body: { mode: "move", moves: moves.slice(1) },
  });
  expect(small.movedCount).toBe(1);
  expect(large.movedCount).toBe(500);
  expect(large.raisedElsewhere).toHaveLength(500);
  expect(counter.getQueryCount()).toBe(smallCount);
  expect(smallCount).toBeLessThan(20);
  return { ...state, counter, context, small, smallCount, large };
}

async function _usesConstantQueryCountsForOneVersus2Stage4(
  state: Readonly<UsesConstantQueryCountsForOneVersus2State3>,
): Promise<UsesConstantQueryCountsForOneVersus2State4> {
  const { database } = state;
  expect(await database.selectFrom("bursts").selectAll().execute()).toEqual([]);
  return { ...state };
}

async function _assertRearmsOtherSpansAndReportsFullVisibleMismatch1(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const state0 = { database };
    const state1 = await _rearmsOtherSpansAndReportsFullVisible1Stage1(state0);
    const state2 = await _rearmsOtherSpansAndReportsFullVisible1Stage2(state1);
    const state3 = await _rearmsOtherSpansAndReportsFullVisible1Stage3(state2);
    const state4 = await _rearmsOtherSpansAndReportsFullVisible1Stage4(state3);
    await _rearmsOtherSpansAndReportsFullVisible1Stage5(state4);
  } finally {
    await database.destroy();
  }
}

async function _assertUsesConstantQueryCountsForOneVersus5002(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const state0 = { database };
    const state1 = await _usesConstantQueryCountsForOneVersus2Stage1(state0);
    const state2 = await _usesConstantQueryCountsForOneVersus2Stage2(state1);
    const state3 = await _usesConstantQueryCountsForOneVersus2Stage3(state2);
    await _usesConstantQueryCountsForOneVersus2Stage4(state3);
  } finally {
    await database.destroy();
  }
}
describe("milestone reconciliation batches", () => {
  it(
    "rearms other spans and reports full visible mismatch counts, excluding hidden and acknowledged siblings",
    _assertRearmsOtherSpansAndReportsFullVisibleMismatch1,
  );

  it(
    "uses constant query counts for one versus 500 items, distinct bursts, and raised occasions",
    _assertUsesConstantQueryCountsForOneVersus5002,
  );
});
