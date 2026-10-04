import type { Viewer } from "../../http/requestContextHelpers.ts";
import { describe, expect, it } from "vitest";
import { itemSummarySchema } from "@memory-shoebox/shared";
import { readItemSummariesByItemIds } from "./readItemSummariesByItemIds.ts";
import {
  createTestApp,
  type TestApp,
} from "../../../test/helpers/createTestApp.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../../test/helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../visibility/everyoneRule.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
  insertBurst,
  insertUploadSession,
  insertVisibilityRule,
  setBurstCover,
  insertItemView,
  insertPerson,
  insertItemPerson,
  NOW,
} from "../../../test/helpers/seedHelpers/seedHelpers.ts";
type ItemSummaryReadContext = {
  database: TestApp["database"];
  b2: TestApp["b2"];
  viewer: Viewer;
  now: Date;
};

type KeepsRequestedIdentitiesAndMeasuresFullVisible1State0 = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  b2: Awaited<ReturnType<typeof createTestApp>>["b2"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type KeepsRequestedIdentitiesAndMeasuresFullVisible1State1 =
  KeepsRequestedIdentitiesAndMeasuresFullVisible1State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    uploader: Awaited<ReturnType<typeof insertMember>>;
    hiddenRule: Awaited<ReturnType<typeof insertVisibilityRule>>;
    uploadSessionId: Awaited<ReturnType<typeof insertUploadSession>>;
    burstId: Awaited<ReturnType<typeof insertBurst>>;
  };
type KeepsRequestedIdentitiesAndMeasuresFullVisible1State2 =
  KeepsRequestedIdentitiesAndMeasuresFullVisible1State1 & {
    itemIds: string[];
    personId: Awaited<ReturnType<typeof insertPerson>>;
  };
type KeepsRequestedIdentitiesAndMeasuresFullVisible1State3 =
  KeepsRequestedIdentitiesAndMeasuresFullVisible1State2 & {
    brokenId: Awaited<ReturnType<typeof insertItem>>;
    viewer: Viewer;
    summaries: Awaited<ReturnType<typeof readItemSummariesByItemIds>>;
    summary: ReturnType<typeof itemSummarySchema.parse>;
  };
type KeepsRequestedIdentitiesAndMeasuresFullVisible1State4 =
  KeepsRequestedIdentitiesAndMeasuresFullVisible1State3;
type KeepsRequestedIdentitiesAndMeasuresFullVisible1State5 =
  KeepsRequestedIdentitiesAndMeasuresFullVisible1State4 & {
    singleton: Awaited<ReturnType<typeof readItemSummariesByItemIds>>;
  };

type KeepsQueryCountFixedAsRequestedItems2State0 = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  b2: Awaited<ReturnType<typeof createTestApp>>["b2"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type KeepsQueryCountFixedAsRequestedItems2State1 =
  KeepsQueryCountFixedAsRequestedItems2State0 & {
    memberId: Awaited<ReturnType<typeof insertMember>>;
    uploadSessionId: Awaited<ReturnType<typeof insertUploadSession>>;
    itemIds: string[];
    counting: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
  };
type KeepsQueryCountFixedAsRequestedItems2State2 =
  KeepsQueryCountFixedAsRequestedItems2State1 & {
    options: ItemSummaryReadContext;
    smallCount: number;
  };
type KeepsQueryCountFixedAsRequestedItems2State3 =
  KeepsQueryCountFixedAsRequestedItems2State2;

async function _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage1(
  state: Readonly<KeepsRequestedIdentitiesAndMeasuresFullVisible1State0>,
): Promise<KeepsRequestedIdentitiesAndMeasuresFullVisible1State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const uploader = await insertMember(database, { display_name: "Pat" });
  const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: uploader,
  });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  return {
    ...state,
    memberId,
    uploader,
    hiddenRule,
    uploadSessionId,
    burstId,
  };
}

async function _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage2(
  state: Readonly<KeepsRequestedIdentitiesAndMeasuresFullVisible1State1>,
): Promise<KeepsRequestedIdentitiesAndMeasuresFullVisible1State2> {
  const { database, uploader, burstId, hiddenRule, memberId } = state;
  const itemIds = await [0, 1, 2, 3].reduce(
    async (previousItemInsertion, index) => {
      const accumulatedItemIds = await previousItemInsertion;
      const itemId = await insertItem(database, {
        uploadedBy: uploader,
        seq: index,
        burst_id: burstId,
        burst_index: index,
        captured_at: `2026-09-27T12:00:0${index}.000Z`,
        ...(index === 3 ? { visibility_rule_id: hiddenRule } : {}),
      });
      await insertRendition(database, { itemId });
      return [...accumulatedItemIds, itemId];
    },
    Promise.resolve<string[]>([]),
  );
  await setBurstCover(database, { burstId, coverItemId: itemIds[3]! });
  await insertItemView(database, { memberId, itemId: itemIds[1]! });
  const personId = await insertPerson(database, {
    displayName: "Robin",
    member_id: memberId,
  });
  await insertItemPerson(database, { itemId: itemIds[1]!, personId });
  await insertItemPerson(database, { itemId: itemIds[3]!, personId });
  return { ...state, itemIds, personId };
}

async function _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage3(
  state: Readonly<KeepsRequestedIdentitiesAndMeasuresFullVisible1State2>,
): Promise<KeepsRequestedIdentitiesAndMeasuresFullVisible1State3> {
  const { b2, memberId, database, uploader, itemIds } = state;
  const brokenId = await insertItem(database, {
    uploadedBy: uploader,
    seq: 4,
  });
  const viewer = {
    memberId,
    sessionId: "session",
    role: "viewer" as const,
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
  const summaries = await readItemSummariesByItemIds({
    database,
    b2,
    viewer,
    itemIds: [itemIds[1]!, itemIds[3]!, brokenId, "missing"],
    now: new Date(NOW),
  });
  expect([...summaries.keys()]).toEqual([itemIds[1]]);
  const summary = itemSummarySchema.parse(summaries.get(itemIds[1]!));
  return { ...state, brokenId, viewer, summaries, summary };
}

async function _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage4(
  state: Readonly<KeepsRequestedIdentitiesAndMeasuresFullVisible1State3>,
): Promise<KeepsRequestedIdentitiesAndMeasuresFullVisible1State4> {
  const { burstId, summary, itemIds, uploader, database, hiddenRule } = state;
  expect(summary).toMatchObject({
    itemId: itemIds[1],
    isUnseen: false,
    uploadedBy: { memberId: uploader, displayName: "Pat" },
    visibility: { mode: "everyone" },
    burst: {
      burstId,
      visibleFrameCount: 3,
      coverItemId: itemIds[0],
      startsAt: "2026-09-27T12:00:00.000Z",
      endsAt: "2026-09-27T12:00:02.000Z",
      hasUnseenFrames: true,
    },
  });
  expect(summary.media.altText).toContain("Robin");
  await database
    .updateTable("items")
    .set({ visibility_rule_id: hiddenRule })
    .where("id", "in", [itemIds[0]!, itemIds[2]!])
    .execute();
  return { ...state };
}

async function _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage5(
  state: Readonly<KeepsRequestedIdentitiesAndMeasuresFullVisible1State4>,
): Promise<KeepsRequestedIdentitiesAndMeasuresFullVisible1State5> {
  const { viewer, b2, database, itemIds } = state;
  const singleton = await readItemSummariesByItemIds({
    database,
    b2,
    viewer,
    itemIds: [itemIds[1]!],
    now: new Date(NOW),
  });
  expect(singleton.get(itemIds[1]!)?.burst).toBeNull();
  return { ...state, singleton };
}

async function _keepsQueryCountFixedAsRequestedItems2Stage1(
  state: Readonly<KeepsQueryCountFixedAsRequestedItems2State0>,
): Promise<KeepsQueryCountFixedAsRequestedItems2State1> {
  const { database } = state;
  const memberId = await insertMember(database);
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const itemIds = await Array.from({ length: 20 }, (_, index) => {
    return index;
  }).reduce(async (previousItemInsertion, index) => {
    const accumulatedItemIds = await previousItemInsertion;
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
    await insertRendition(database, { itemId });
    return [...accumulatedItemIds, itemId];
  }, Promise.resolve<string[]>([]));
  const counting = makeQueryCountingDatabaseFromDatabase(database);
  return { ...state, memberId, uploadSessionId, itemIds, counting };
}

async function _keepsQueryCountFixedAsRequestedItems2Stage2(
  state: Readonly<KeepsQueryCountFixedAsRequestedItems2State1>,
): Promise<KeepsQueryCountFixedAsRequestedItems2State2> {
  const { memberId, b2, counting, itemIds } = state;
  const options = {
    database: counting.database,
    b2,
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
      await readItemSummariesByItemIds({
        ...options,
        itemIds: itemIds.slice(0, 1),
      })
    ).size,
  ).toBe(1);
  const smallCount = counting.getQueryCount();
  return { ...state, options, smallCount };
}

async function _keepsQueryCountFixedAsRequestedItems2Stage3(
  state: Readonly<KeepsQueryCountFixedAsRequestedItems2State2>,
): Promise<KeepsQueryCountFixedAsRequestedItems2State3> {
  const { counting, options, itemIds, smallCount } = state;
  counting.reset();
  expect(
    (await readItemSummariesByItemIds({ ...options, itemIds: itemIds })).size,
  ).toBe(20);
  expect(counting.getQueryCount()).toBe(smallCount);
  expect(smallCount).toBeLessThanOrEqual(10);
  counting.reset();
  expect(
    (await readItemSummariesByItemIds({ ...options, itemIds: [] })).size,
  ).toBe(0);
  expect(counting.getQueryCount()).toBe(0);
  return { ...state };
}

async function _assertKeepsRequestedIdentitiesAndMeasuresFullVisibleBursts1(): Promise<void> {
  const { database, b2, close } = await createTestApp();
  try {
    const state0 = { database, b2, close };
    const state1 =
      await _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage1(state0);
    const state2 =
      await _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage2(state1);
    const state3 =
      await _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage3(state2);
    const state4 =
      await _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage4(state3);
    await _keepsRequestedIdentitiesAndMeasuresFullVisible1Stage5(state4);
  } finally {
    await close();
  }
}

async function _assertKeepsQueryCountFixedAsRequestedItemsAnd2(): Promise<void> {
  const { database, b2, close } = await createTestApp();
  try {
    const state0 = { database, b2, close };
    const state1 = await _keepsQueryCountFixedAsRequestedItems2Stage1(state0);
    const state2 = await _keepsQueryCountFixedAsRequestedItems2Stage2(state1);
    await _keepsQueryCountFixedAsRequestedItems2Stage3(state2);
  } finally {
    await close();
  }
}
describe("readItemSummariesByItemIds", () => {
  it(
    "keeps requested identities and measures full visible bursts without exposing hidden covers",
    _assertKeepsRequestedIdentitiesAndMeasuresFullVisibleBursts1,
  );

  it(
    "keeps query count fixed as requested items and bursts grow",
    _assertKeepsQueryCountFixedAsRequestedItemsAnd2,
  );
});
