import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { describe, expect, it } from "vitest";
import { readMilestoneCandidates } from "../../src/milestones/readMilestoneCandidates.ts";
import { readMilestoneMismatches } from "../../src/milestones/readMilestoneMismatches.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertRendition,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
type PickerReadContext = {
  database: TestApp["database"];
  b2: TestApp["b2"];
  viewer: Viewer;
  now: Date;
  milestoneId: string;
};

type UsesFixedQueryCountsForCandidatesAnd1State0 = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  b2: Awaited<ReturnType<typeof createTestApp>>["b2"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type UsesFixedQueryCountsForCandidatesAnd1State1 =
  UsesFixedQueryCountsForCandidatesAnd1State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    counting: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
  };
type UsesFixedQueryCountsForCandidatesAnd1State2 =
  UsesFixedQueryCountsForCandidatesAnd1State1 & {
    options: PickerReadContext;
  };
type UsesFixedQueryCountsForCandidatesAnd1State3 =
  UsesFixedQueryCountsForCandidatesAnd1State2 & {
    candidatesCount: number;
    mismatchesCount: number;
  };
type UsesFixedQueryCountsForCandidatesAnd1State4 =
  UsesFixedQueryCountsForCandidatesAnd1State3;

async function _usesFixedQueryCountsForCandidatesAnd1Stage1(
  state: Readonly<UsesFixedQueryCountsForCandidatesAnd1State0>,
): Promise<UsesFixedQueryCountsForCandidatesAnd1State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const milestoneId = await insertMilestone(database, {
    name: "Trip",
    startsOn: "2026-09-01",
  });
  await Array.from({ length: 20 }, (_, index) => {
    return index;
  }).reduce(async (previousItemInsertion, itemSequence) => {
    await previousItemInsertion;
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: itemSequence,
    });
    await insertRendition(database, { itemId });
    await insertItemMilestone(database, { itemId, milestoneId });
  }, Promise.resolve());
  const counting = makeQueryCountingDatabaseFromDatabase(database);
  return { ...state, memberId, milestoneId, counting };
}

async function _usesFixedQueryCountsForCandidatesAnd1Stage2(
  state: Readonly<UsesFixedQueryCountsForCandidatesAnd1State1>,
): Promise<UsesFixedQueryCountsForCandidatesAnd1State2> {
  const { memberId, milestoneId, b2, counting } = state;
  const options = {
    database: counting.database,
    b2,
    milestoneId,
    viewer: {
      memberId,
      sessionId: "session",
      role: "viewer" as const,
      isAdmin: false,
      visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
    },
    now: new Date(NOW),
  };
  counting.reset();
  expect(
    (
      await readMilestoneCandidates({
        ...options,
        query: { scope: "all", limit: 1 },
      })
    ).candidates,
  ).toHaveLength(1);
  return { ...state, options };
}

async function _usesFixedQueryCountsForCandidatesAnd1Stage3(
  state: Readonly<UsesFixedQueryCountsForCandidatesAnd1State2>,
): Promise<UsesFixedQueryCountsForCandidatesAnd1State3> {
  const { counting, options } = state;
  const candidatesCount = counting.getQueryCount();
  counting.reset();
  expect(
    (
      await readMilestoneCandidates({
        ...options,
        query: { scope: "all", limit: 20 },
      })
    ).candidates,
  ).toHaveLength(20);
  expect(counting.getQueryCount()).toBe(candidatesCount);
  counting.reset();
  expect(
    (await readMilestoneMismatches({ ...options, query: { limit: 1 } }))
      .mismatches,
  ).toHaveLength(1);
  const mismatchesCount = counting.getQueryCount();
  counting.reset();
  expect(
    (await readMilestoneMismatches({ ...options, query: { limit: 20 } }))
      .mismatches,
  ).toHaveLength(20);
  return { ...state, candidatesCount, mismatchesCount };
}

async function _usesFixedQueryCountsForCandidatesAnd1Stage4(
  state: Readonly<UsesFixedQueryCountsForCandidatesAnd1State3>,
): Promise<UsesFixedQueryCountsForCandidatesAnd1State4> {
  const { counting, mismatchesCount } = state;
  expect(counting.getQueryCount()).toBe(mismatchesCount);
  expect(mismatchesCount).toBeLessThanOrEqual(12);
  return { ...state };
}

async function _assertUsesFixedQueryCountsForCandidatesAndFull1(): Promise<void> {
  const { database, b2, close } = await createTestApp();
  try {
    const state0 = { database, b2, close };
    const state1 = await _usesFixedQueryCountsForCandidatesAnd1Stage1(state0);
    const state2 = await _usesFixedQueryCountsForCandidatesAnd1Stage2(state1);
    const state3 = await _usesFixedQueryCountsForCandidatesAnd1Stage3(state2);
    await _usesFixedQueryCountsForCandidatesAnd1Stage4(state3);
  } finally {
    await close();
  }
}
describe("milestone picker batching", () => {
  it(
    "uses fixed query counts for candidates and full-set mismatches as pages grow",
    _assertUsesFixedQueryCountsForCandidatesAndFull1,
  );
});
