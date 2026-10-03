import { describe, expect, it } from "vitest";
import { readMilestoneCandidates } from "../../src/milestones/readMilestoneCandidates.ts";
import { readMilestoneMismatches } from "../../src/milestones/readMilestoneMismatches.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
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

describe("milestone picker batching", () => {
  it("uses fixed query counts for candidates and full-set mismatches as pages grow", async () => {
    const { database, b2, close } = await createTestApp();
    try {
      const memberId = await insertMember(database);
      const milestoneId = await insertMilestone(database, {
        name: "Trip",
        startsOn: "2026-09-01",
      });
      await Array.from({ length: 20 }, (_, index) => {
        return index;
      }).reduce(async (previous, seq) => {
        await previous;
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq,
        });
        await insertRendition(database, { itemId });
        await insertItemMilestone(database, { itemId, milestoneId });
      }, Promise.resolve());
      const counting = makeQueryCountingDatabaseFromDatabase(database);
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
      expect(counting.getQueryCount()).toBe(mismatchesCount);
      expect(mismatchesCount).toBeLessThanOrEqual(12);
    } finally {
      await close();
    }
  });
});
