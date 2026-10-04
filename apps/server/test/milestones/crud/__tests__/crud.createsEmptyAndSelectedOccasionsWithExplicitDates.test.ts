import { describe, expect, it } from "vitest";
import { createMilestoneResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertItem, NOW } from "../../../helpers/seedHelpers/seedHelpers.ts";

type CreatesEmptyAndSelectedOccasionsWithExplicit1State0 = {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};

type CreatesEmptyAndSelectedOccasionsWithExplicit1State1 =
  CreatesEmptyAndSelectedOccasionsWithExplicit1State0 & {
    cookie: Awaited<ReturnType<typeof insertSignedInMember>>["cookie"];
    memberId: Awaited<ReturnType<typeof insertSignedInMember>>["memberId"];
    itemId: Awaited<ReturnType<typeof insertItem>>;
    body: { name: string; startsOn: string; endsOn: string; blurb: string };
    empty: import("fastify").LightMyRequestResponse;
  };

type CreatesEmptyAndSelectedOccasionsWithExplicit1State2 =
  CreatesEmptyAndSelectedOccasionsWithExplicit1State1 & {
    selected: import("fastify").LightMyRequestResponse;
  };

type CreatesEmptyAndSelectedOccasionsWithExplicit1State3 =
  CreatesEmptyAndSelectedOccasionsWithExplicit1State2;

async function _createsEmptyAndSelectedOccasionsWithExplicit1Stage1(
  state: Readonly<CreatesEmptyAndSelectedOccasionsWithExplicit1State0>,
): Promise<CreatesEmptyAndSelectedOccasionsWithExplicit1State1> {
  const { database, app } = state;
  const { cookie, memberId } = await insertSignedInMember({ database });
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const body = {
    name: " Occasion ",
    startsOn: "2026-09-01",
    endsOn: "2026-09-03",
    blurb: " ",
  };
  const empty = await app.inject({
    method: "POST",
    url: "/api/milestones",
    headers: { cookie },
    payload: body,
  });
  expect(empty.statusCode).toBe(201);
  return { ...state, cookie, memberId, itemId, body, empty };
}

async function _createsEmptyAndSelectedOccasionsWithExplicit1Stage2(
  state: Readonly<CreatesEmptyAndSelectedOccasionsWithExplicit1State1>,
): Promise<CreatesEmptyAndSelectedOccasionsWithExplicit1State2> {
  const { cookie, memberId, empty, body, app, itemId } = state;
  expect(createMilestoneResponseSchema.parse(empty.json())).toMatchObject({
    itemCount: 0,
    dayCount: 3,
    mismatchCount: 0,
    milestone: {
      name: "Occasion",
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      blurb: null,
    },
    createdBy: { memberId },
  });
  const selected = await app.inject({
    method: "POST",
    url: "/api/milestones",
    headers: { cookie },
    payload: { ...body, itemIds: [itemId] },
  });
  expect(selected.statusCode).toBe(201);
  return { ...state, selected };
}

async function _createsEmptyAndSelectedOccasionsWithExplicit1Stage3(
  state: Readonly<CreatesEmptyAndSelectedOccasionsWithExplicit1State2>,
): Promise<CreatesEmptyAndSelectedOccasionsWithExplicit1State3> {
  const { selected, body, database, memberId } = state;
  expect(selected.json()).toMatchObject({
    itemCount: 1,
    mismatchCount: 1,
    milestone: { startsOn: body.startsOn, endsOn: body.endsOn },
  });
  expect(
    await database.selectFrom("item_milestones").selectAll().execute(),
  ).toMatchObject([
    {
      attached_by: memberId,
      attached_at: NOW,
      span_mismatch_acknowledged_at: null,
    },
  ]);
  return { ...state };
}

async function _assertCreatesEmptyAndSelectedOccasionsWithExplicitDates1(): Promise<void> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  try {
    const state0 = { app, database, close };
    const state1 =
      await _createsEmptyAndSelectedOccasionsWithExplicit1Stage1(state0);
    const state2 =
      await _createsEmptyAndSelectedOccasionsWithExplicit1Stage2(state1);
    await _createsEmptyAndSelectedOccasionsWithExplicit1Stage3(state2);
  } finally {
    await close();
  }
}
describe("milestone CRUD", (): void => {
  it(
    "creates empty and selected occasions with explicit dates, duplicate names, and outside-span counts",
    _assertCreatesEmptyAndSelectedOccasionsWithExplicitDates1,
  );
});
