import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  hasAnyFilter,
  hasContentFilter,
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
} from "../../src/archive/selectionFilter.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertTag,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** A plain viewer who can see the `everyone` rule and nothing else. */
function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("makeTimelineFilterFromQuery", () => {
  it("sorts and dedupes, so one selection has one digest", () => {
    const filter = makeTimelineFilterFromQuery({
      tags: ["b", "a", "a"],
      people: ["d", "c"],
    });
    expect(filter.tagIds).toEqual(["a", "b"]);
    expect(filter.personIds).toEqual(["c", "d"]);
  });

  it("ignores excludeAttached with no milestone beside it", () => {
    expect(
      makeTimelineFilterFromQuery({ excludeAttached: true }).excludeAttached,
    ).toBe(false);
  });
});

describe("hasContentFilter", () => {
  it("is false for a date range, which keeps the milestone union", () => {
    const filter = makeTimelineFilterFromQuery({ from: "2026-09-01" });
    expect(hasContentFilter(filter)).toBe(false);
    expect(hasAnyFilter(filter)).toBe(true);
  });

  it("is true for a tag, a person or a milestone attachment", () => {
    expect(hasContentFilter(makeTimelineFilterFromQuery({ tags: ["a"] }))).toBe(
      true,
    );
    expect(
      hasContentFilter(makeTimelineFilterFromQuery({ people: ["a"] })),
    ).toBe(true);
    expect(
      hasContentFilter(
        makeTimelineFilterFromQuery({ attachedToMilestoneId: "a" }),
      ),
    ).toBe(true);
  });

  it("is false for nothing selected at all", () => {
    expect(hasAnyFilter(makeTimelineFilterFromQuery({}))).toBe(false);
  });
});

describe("makeSelectionExpressionFromFilter", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  const selectIds = async (options: {
    viewer: Viewer;
    filter: ReturnType<typeof makeTimelineFilterFromQuery>;
  }): Promise<string[]> => {
    const rows = await database
      .selectFrom("items")
      .select("items.id as id")
      .where(
        makeSelectionExpressionFromFilter({
          viewer: options.viewer,
          filter: options.filter,
        }),
      )
      .orderBy("items.seq", "asc")
      .execute();
    return rows.map((row) => {
      return row.id;
    });
  };

  it("keeps only what the viewer may see", async () => {
    const memberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const visibleId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([visibleId]);
  });

  it("keeps an item the viewer uploaded under a rule they cannot see", async () => {
    const memberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const mineId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      visibility_rule_id: restrictedRuleId,
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([mineId]);
  });

  it("ANDs two tags rather than fanning the row out", async () => {
    const memberId = await insertMember(database);
    const bothId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const oneId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    const beachId = await insertTag(database, { name: "beach" });
    const summerId = await insertTag(database, { name: "summer" });
    await insertItemTag(database, { itemId: bothId, tagId: beachId });
    await insertItemTag(database, { itemId: bothId, tagId: summerId });
    await insertItemTag(database, { itemId: oneId, tagId: beachId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ tags: [beachId, summerId] }),
      }),
    ).toEqual([bothId]);
  });

  it("narrows to nothing on a tag id that does not exist", async () => {
    const memberId = await insertMember(database);
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          tags: ["0199c0a0-0000-7000-8000-00000000dead"],
        }),
      }),
    ).toEqual([]);
  });

  it("narrows to nothing on a person id that does not exist", async () => {
    const memberId = await insertMember(database);
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          people: ["0199c0a0-0000-7000-8000-00000000dead"],
        }),
      }),
    ).toEqual([]);
  });

  it("narrows to nothing on a milestone id that does not exist", async () => {
    const memberId = await insertMember(database);
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          attachedToMilestoneId: "0199c0a0-0000-7000-8000-00000000dead",
        }),
      }),
    ).toEqual([]);
  });

  it("ANDs a person with a date range", async () => {
    const memberId = await insertMember(database);
    const insideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const outsideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-08-01",
    });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId: insideId, personId });
    await insertItemPerson(database, { itemId: outsideId, personId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          people: [personId],
          from: "2026-09-01",
          until: "2026-09-30",
        }),
      }),
    ).toEqual([insideId]);
  });

  it("keeps only items on or after `from`, with no `until`", async () => {
    const memberId = await insertMember(database);
    const insideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const outsideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-08-01",
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ from: "2026-09-01" }),
      }),
    ).toEqual([insideId]);
    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ from: "2026-09-01" }),
      }),
    ).not.toContain(outsideId);
  });

  it("keeps only items on or before `until`, with no `from`", async () => {
    const memberId = await insertMember(database);
    const insideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const outsideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-10-01",
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ until: "2026-09-30" }),
      }),
    ).toEqual([insideId]);
    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ until: "2026-09-30" }),
      }),
    ).not.toContain(outsideId);
  });

  it("takes attachedToMilestoneId both ways round", async () => {
    const memberId = await insertMember(database);
    const attachedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const looseId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });
    await insertItemMilestone(database, { itemId: attachedId, milestoneId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          attachedToMilestoneId: milestoneId,
        }),
      }),
    ).toEqual([attachedId]);
    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          attachedToMilestoneId: milestoneId,
          excludeAttached: true,
        }),
      }),
    ).toEqual([looseId]);
  });
});
