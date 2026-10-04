import { describe, expect, it } from "vitest";
import { listMilestonesResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertMilestone } from "../../../helpers/seedHelpers/seedHelpers.ts";

type PagesEqualStartsByIDDescendingAnd2State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type PagesEqualStartsByIDDescendingAnd2State1 =
  PagesEqualStartsByIDDescendingAnd2State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    first: Awaited<ReturnType<typeof insertMilestone>>;
    second: Awaited<ReturnType<typeof insertMilestone>>;
    firstPage: import("fastify").LightMyRequestResponse;
    parsed: ReturnType<typeof listMilestonesResponseSchema.parse>;
  };

type PagesEqualStartsByIDDescendingAnd2State2 =
  PagesEqualStartsByIDDescendingAnd2State1 & {
    secondPage: import("fastify").LightMyRequestResponse;
  };

async function _pagesEqualStartsByIDDescendingAnd2Stage1(
  state: Readonly<PagesEqualStartsByIDDescendingAnd2State0>,
): Promise<PagesEqualStartsByIDDescendingAnd2State1> {
  const { database, app } = state;
  const { cookie } = await insertSignedInMember({ database });
  const first = await insertMilestone(database, {
    name: "A",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
  });
  const second = await insertMilestone(database, {
    name: "B",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
  });
  await insertMilestone(database, {
    name: "excluded",
    startsOn: "2026-08-01",
  });
  const firstPage = await app.inject({
    url: "/api/milestones?from=2026-09-15&to=2026-09-16&limit=1",
    headers: { cookie },
  });
  expect(firstPage.statusCode).toBe(200);
  const parsed = listMilestonesResponseSchema.parse(firstPage.json());
  return { ...state, cookie, first, second, firstPage, parsed };
}

async function _pagesEqualStartsByIDDescendingAnd2Stage2(
  state: Readonly<PagesEqualStartsByIDDescendingAnd2State1>,
): Promise<PagesEqualStartsByIDDescendingAnd2State2> {
  const { cookie, parsed, second, app, first } = state;
  expect(
    parsed.milestones.map((row) => {
      return row.milestone.milestoneId;
    }),
  ).toEqual([second]);
  expect(parsed.nextCursor).toBeTypeOf("string");
  const secondPage = await app.inject({
    url: `/api/milestones?from=2026-09-15&to=2026-09-16&limit=1&cursor=${parsed.nextCursor}`,
    headers: { cookie },
  });
  expect(
    secondPage
      .json()
      .milestones.map((row: { milestone: { milestoneId: string } }) => {
        return row.milestone.milestoneId;
      }),
  ).toEqual([first]);
  expect(secondPage.json().nextCursor).toBeNull();
  return { ...state, secondPage };
}

async function _assertPagesEqualStartsByIDDescendingAndFilters2(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const state0 = { app, database, close };
    const state1 = await _pagesEqualStartsByIDDescendingAnd2Stage1(state0);
    await _pagesEqualStartsByIDDescendingAnd2Stage2(state1);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "pages equal starts by ID descending and filters overlapping spans",
    _assertPagesEqualStartsByIDDescendingAndFilters2,
  );
});
