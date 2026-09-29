import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { countSelectedItems } from "../../src/archive/countSelectedItems.ts";
import { readMilestoneItemCounts } from "../../src/archive/readMilestoneItemCounts.ts";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilterHelpers.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemMilestone,
  insertItemTag,
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

describe("readMilestoneItemCounts", () => {
  let database: Kysely<Database>;
  let memberId: string;
  let milestoneId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
    milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });
  });

  it("counts what this viewer can see of the occasion", async () => {
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const visibleId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });
    await insertItemMilestone(database, { itemId: visibleId, milestoneId });
    await insertItemMilestone(database, { itemId: hiddenId, milestoneId });

    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [milestoneId],
        })
      ).get(milestoneId),
    ).toBe(1);
  });

  it("is the occasion's own total, not what a filter leaves of it", async () => {
    const taggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const untaggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItemMilestone(database, { itemId: taggedId, milestoneId });
    await insertItemMilestone(database, { itemId: untaggedId, milestoneId });

    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [milestoneId],
        })
      ).get(milestoneId),
    ).toBe(2);
  });

  it("batches two occasions, returning each one's own count", async () => {
    const otherMilestoneId = await insertMilestone(database, {
      name: "First steps",
      startsOn: "2026-09-20",
    });
    const firstId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    const thirdId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
    });
    await insertItemMilestone(database, { itemId: firstId, milestoneId });
    await insertItemMilestone(database, { itemId: secondId, milestoneId });
    await insertItemMilestone(database, {
      itemId: thirdId,
      milestoneId: otherMilestoneId,
    });

    const counts = await readMilestoneItemCounts({
      database,
      viewer: makeViewer(memberId),
      milestoneIds: [milestoneId, otherMilestoneId],
    });

    expect(counts.get(milestoneId)).toBe(2);
    expect(counts.get(otherMilestoneId)).toBe(1);
  });

  it("is empty for no bands, and runs nothing", async () => {
    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [],
        })
      ).size,
    ).toBe(0);
  });
});

describe("countSelectedItems", () => {
  it("counts items, frames included, filtered by the same predicate", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const tagId = await insertTag(database, { name: "beach" });
    const taggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });
    await insertItem(database, { uploadedBy: memberId, seq: 3 });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItemTag(database, { itemId: hiddenId, tagId });

    expect(
      await countSelectedItems({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toBe(2);
    expect(
      await countSelectedItems({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ tags: [tagId] }),
      }),
    ).toBe(1);

    await database.destroy();
  });
});
