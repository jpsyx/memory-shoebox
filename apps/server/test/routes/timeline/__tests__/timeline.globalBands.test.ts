import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMilestone,
  insertPerson,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
type SeedGlobalTimelineBandsResult = {
  cookie: string;
  weekId: string;
  homeId: string;
  personId: string;
};

type AssertFilteredGlobalTimelineBandsOptions = {
  app: TestApp["app"];
  cookie: string;
  personId: string;
  weekId: string;
};

async function _seedGlobalTimelineBands(
  database: TestApp["database"],
): Promise<SeedGlobalTimelineBandsResult> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const weekId = await insertMilestone(database, {
    name: "First week",
    startsOn: "2026-09-17",
    endsOn: "2026-09-21",
  });
  const homeId = await insertMilestone(database, {
    name: "Home",
    startsOn: "2026-09-17",
  });
  const itemId = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
    captured_on: "2026-09-20",
  });
  const personId = await insertPerson(database, { displayName: "Mateo" });
  await insertItemPerson(database, { itemId, personId });
  return { cookie, weekId, homeId, personId };
}

async function _assertFilteredGlobalTimelineBands(
  options: Readonly<AssertFilteredGlobalTimelineBandsOptions>,
): Promise<void> {
  const { app, cookie, personId, weekId } = options;
  for (const query of [
    "until=2026-09-20",
    `people=${personId}`,
    "limit=1&until=2026-09-20",
  ]) {
    const response = await app.inject({
      method: "GET",
      url: `/api/timeline?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().days[0].capturedOn).toBe("2026-09-20");
    expect(response.json().days[0].milestoneBand).toBeNull();
    expect(
      response.json().days[0].milestoneStrips[0].milestone.milestoneId,
    ).toBe(weekId);
  }
}

async function _assertGlobalTimelineBands(): Promise<void> {
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const { cookie, weekId, homeId, personId } =
    await _seedGlobalTimelineBands(database);
  const full = await app.inject({
    method: "GET",
    url: "/api/timeline",
    headers: { cookie },
  });
  expect(full.json().days[0].milestoneBand.milestone.milestoneId).toBe(weekId);
  await _assertFilteredGlobalTimelineBands({ app, cookie, personId, weekId });
  const first = await app.inject({
    method: "GET",
    url: "/api/timeline?limit=1",
    headers: { cookie },
  });
  const legacy = JSON.parse(
    Buffer.from(first.json().nextCursor, "base64url").toString(),
  );
  legacy.o = [weekId, homeId];
  const cursor = Buffer.from(JSON.stringify(legacy)).toString("base64url");
  const page = await app.inject({
    method: "GET",
    url: `/api/timeline?cursor=${cursor}`,
    headers: { cookie },
  });
  expect(
    page.json().days.find((day: { capturedOn: string }) => {
      return day.capturedOn === "2026-09-17";
    }).milestoneBand.milestone.milestoneId,
  ).toBe(homeId);
  await close();
}
describe("GET /api/timeline", () => {
  it(
    "keeps global bands under date filters, content filters, paging and legacy cursors",
    _assertGlobalTimelineBands,
  );
});
