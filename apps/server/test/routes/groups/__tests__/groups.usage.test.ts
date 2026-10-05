import { describe, expect, it } from "vitest";
import { readGroups } from "../../../../src/administration/groupReadHelpers.ts";
import { readGroupUsage } from "../../../../src/administration/groupUsageHelpers.ts";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertItem,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { prepareCountedGroupFixture } from "./groupsTestHelpers.ts";

async function _seedAdditionalGroupUsage(
  options: Readonly<{
    database: DatabaseExecutor;
    groupId: string;
    memberId: string;
  }>,
): Promise<void> {
  const { database, groupId, memberId } = options;
  await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const addedId = await insertGroup(database, {
        name: `Family ${index}`,
      });
      await insertGroupMember(database, {
        groupId: addedId,
        memberId,
      });
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      await insertVisibilityRuleSubject(database, { ruleId, groupId });
      await insertVisibilityRuleSubject(database, {
        ruleId,
        groupId: addedId,
      });
      await insertItem(database, {
        uploadedBy: memberId,
        visibility_rule_id: ruleId,
        seq: index + 3,
      });
    }),
  );
}

describe("groups", () => {
  it("counts items in both directions with fixed batch query costs as groups grow", async () => {
    const { counted, groupId, database, admin, viewer, close } =
      await prepareCountedGroupFixture();
    await readGroupUsage({
      database: counted.database,
      groupId,
      secret: "test",
      now: NOW,
    });
    const usageQueryCount = counted.getQueryCount();
    await _seedAdditionalGroupUsage({
      database,
      groupId,
      memberId: admin.memberId,
    });
    counted.reset();
    const expanded = await readGroups({ database: counted.database, viewer });
    expect(counted.getQueryCount()).toBe(3);
    expect(expanded.groups).toHaveLength(11);
    counted.reset();
    const usage = await readGroupUsage({
      database: counted.database,
      groupId,
      secret: "test",
      now: NOW,
    });
    expect(counted.getQueryCount()).toBe(usageQueryCount);
    expect(usage.rules).toHaveLength(12);
    expect(usage.narrowingItemCount).toBe(12);
    expect(usage.wideningItemCount).toBe(1);
    await close();
  });
});
