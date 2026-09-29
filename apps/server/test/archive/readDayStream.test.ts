import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilterHelpers.ts";
import { readDayStream } from "../../src/archive/readDayStream.ts";
import { readItemDays } from "../../src/archive/readItemDays.ts";
import { readOverlappingMilestones } from "../../src/archive/readOverlappingMilestones.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemTag,
  insertItemView,
  insertMember,
  insertMilestone,
  insertTag,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("readItemDays", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
  });

  it("groups by capture day, newest first, with per-viewer counts", async () => {
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-13",
    });

    expect(
      await readItemDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([
      { capturedOn: "2026-09-14", itemCount: 2, unseenCount: 2 },
      { capturedOn: "2026-09-13", itemCount: 1, unseenCount: 1 },
    ]);
  });

  it("keeps a day whose every item has been seen, at unseenCount 0", async () => {
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItemView(database, { memberId, itemId });

    expect(
      await readItemDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([{ capturedOn: "2026-09-14", itemCount: 1, unseenCount: 0 }]);
  });

  it("does not count somebody else's view as this viewer having seen it", async () => {
    const otherMemberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertItemView(database, { memberId: otherMemberId, itemId });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
    });
    expect(days[0]?.unseenCount).toBe(1);
  });

  it("counts only what the viewer may see", async () => {
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      captured_on: "2026-09-14",
      visibility_rule_id: restrictedRuleId,
    });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
    });
    expect(days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 1, unseenCount: 1 },
    ]);
  });

  it("stops before the cursor day and at the limit", async () => {
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-12",
    });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      beforeDay: "2026-09-14",
      limit: 1,
    });
    expect(days).toEqual([
      { capturedOn: "2026-09-13", itemCount: 1, unseenCount: 1 },
    ]);
  });
});

describe("readOverlappingMilestones", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("returns what covers the window and nothing else", async () => {
    const insideId = await insertMilestone(database, {
      name: "A week at the grandparents'",
      startsOn: "2026-09-09",
      endsOn: "2026-09-13",
    });
    await insertMilestone(database, {
      name: "Next summer",
      startsOn: "2027-07-01",
      endsOn: "2027-07-10",
    });

    const milestones = await readOverlappingMilestones({
      database,
      fromDay: undefined,
      untilDay: undefined,
      beforeDay: "2026-09-15",
      sinceDay: "2026-09-10",
    });
    expect(
      milestones.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([insideId]);
  });

  it("reads as a MilestoneRef, blurb included", async () => {
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
      blurb: "Seven days old",
    });

    expect(
      await readOverlappingMilestones({
        database,
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual([
      {
        milestoneId,
        name: "Home from the hospital",
        startsOn: "2026-09-17",
        endsOn: "2026-09-17",
        blurb: "Seven days old",
      },
    ]);
  });
});

describe("readDayStream", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });
  });

  const readStream = async (
    filter: ReturnType<typeof makeTimelineFilterFromQuery>,
  ) => {
    return readDayStream({
      database,
      viewer: makeViewer(memberId),
      filter,
      limit: 10,
      beforeDay: undefined,
      itemBudget: 400,
    });
  };

  it("carries a milestone-only day with no filter", async () => {
    const stream = await readStream(makeTimelineFilterFromQuery({}));
    expect(
      stream.days.map((day) => {
        return [day.capturedOn, day.itemCount];
      }),
    ).toEqual([
      ["2026-09-14", 1],
      ["2026-09-13", 0],
    ]);
    expect(stream.hasMore).toBe(false);
  });

  it("keeps it under a date range, which is a window on the same timeline", async () => {
    const stream = await readStream(
      makeTimelineFilterFromQuery({ from: "2026-09-01", until: "2026-09-30" }),
    );
    expect(
      stream.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
  });

  it("drops it under a tag filter, which is a content predicate", async () => {
    const tagId = await insertTag(database, { name: "beach" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    await insertItemTag(database, { itemId, tagId });

    const stream = await readStream(
      makeTimelineFilterFromQuery({ tags: [tagId] }),
    );
    expect(
      stream.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14"]);
  });

  it("still reports the occasions covering the days it returns", async () => {
    const stream = await readStream(makeTimelineFilterFromQuery({}));
    expect(
      stream.milestones.map((milestone) => {
        return milestone.name;
      }),
    ).toEqual(["A quiet day"]);
  });
});

describe("readDayStream, the window floor", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
  });

  it("keeps a milestone-only day inside the floor and drops one below it", async () => {
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-20",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-18",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-16",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 4,
      captured_on: "2026-09-14",
    });
    await insertMilestone(database, {
      name: "Inside the window",
      startsOn: "2026-09-19",
    });
    await insertMilestone(database, {
      name: "Below the floor",
      startsOn: "2026-09-10",
    });

    const stream = await readDayStream({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      limit: 3,
      beforeDay: undefined,
      itemBudget: 400,
    });

    const capturedOns = stream.days.map((day) => {
      return day.capturedOn;
    });
    expect(capturedOns).toContain("2026-09-19");
    expect(capturedOns).not.toContain("2026-09-10");
  });
});
