import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../../src/db/client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMilestone,
  insertItemMilestone,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type KeepsDetailAndListQueryCountsFlat6State0 = {
  counting: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type KeepsDetailAndListQueryCountsFlat6State1 =
  KeepsDetailAndListQueryCountsFlat6State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    milestoneId: Awaited<ReturnType<typeof insertMilestone>>;
    first: Awaited<ReturnType<typeof insertItem>>;
    countQueries: (url: string) => Promise<number>;
    oneDetail: number;
    oneList: number;
  };

type KeepsDetailAndListQueryCountsFlat6State2 =
  KeepsDetailAndListQueryCountsFlat6State1 & {
    response: import("fastify").LightMyRequestResponse;
  };

type KeepsDetailAndListQueryCountsFlat6State3 =
  KeepsDetailAndListQueryCountsFlat6State2;

async function _keepsDetailAndListQueryCountsFlat6Stage1(
  state: Readonly<KeepsDetailAndListQueryCountsFlat6State0>,
): Promise<KeepsDetailAndListQueryCountsFlat6State1> {
  const { database, app, counting } = state;
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-01",
  });
  const first = await insertItem(database, { uploadedBy: memberId });
  await insertItemMilestone(database, { milestoneId, itemId: first });
  await app.inject({
    url: `/api/milestones/${milestoneId}`,
    headers: { cookie },
  });
  const countQueries = async (url: string) => {
    counting.reset();
    const response = await app.inject({ url, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return counting.getQueryCount();
  };
  const oneDetail = await countQueries(`/api/milestones/${milestoneId}`);
  const oneList = await countQueries("/api/milestones");
  return {
    ...state,
    cookie,
    memberId,
    milestoneId,
    first,
    countQueries,
    oneDetail,
    oneList,
  };
}

async function _keepsDetailAndListQueryCountsFlat6Stage2(
  state: Readonly<KeepsDetailAndListQueryCountsFlat6State1>,
): Promise<KeepsDetailAndListQueryCountsFlat6State2> {
  const {
    cookie,
    database,
    memberId,
    countQueries,
    milestoneId,
    oneDetail,
    oneList,
    app,
  } = state;
  await Array.from({ length: 39 }, (_, index) => {
    return index + 1;
  }).reduce(async (previousFixtureInsertion, index) => {
    await previousFixtureInsertion;
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: index,
    });
    await insertItemMilestone(database, { milestoneId, itemId });
    await insertMilestone(database, {
      name: `occasion ${index}`,
      startsOn: "2026-09-01",
    });
  }, Promise.resolve());
  expect(await countQueries(`/api/milestones/${milestoneId}`)).toBe(oneDetail);
  expect(await countQueries("/api/milestones")).toBe(oneList);
  const response = await app.inject({
    url: `/api/milestones/${milestoneId}`,
    headers: { cookie },
  });
  return { ...state, response };
}

async function _keepsDetailAndListQueryCountsFlat6Stage3(
  state: Readonly<KeepsDetailAndListQueryCountsFlat6State2>,
): Promise<KeepsDetailAndListQueryCountsFlat6State3> {
  const { response } = state;
  expect(response.json()).toMatchObject({
    itemCount: 40,
    mismatchCount: 40,
  });
  return { ...state };
}

async function _assertKeepsDetailAndListQueryCountsFlatFrom6(): Promise<void> {
  const counting = makeQueryCountingDatabaseFromDatabase(
    createDatabase(":memory:"),
  );
  const { app, database, close } = await createTestApp({
    database: counting.database,
    clock: () => {
      return new Date(NOW);
    },
  });
  try {
    const state0 = { counting, app, database, close };
    const state1 = await _keepsDetailAndListQueryCountsFlat6Stage1(state0);
    const state2 = await _keepsDetailAndListQueryCountsFlat6Stage2(state1);
    await _keepsDetailAndListQueryCountsFlat6Stage3(state2);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "keeps detail and list query counts flat from one to forty attachments and occasions",
    _assertKeepsDetailAndListQueryCountsFlatFrom6,
  );
});
