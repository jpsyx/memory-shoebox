import { describe, expect, it } from "vitest";
import { itemSummarySchema } from "@memory-shoebox/shared";
import { readItemSummariesByItemIds } from "../../src/archive/readItemSummariesByItemIds.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
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
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readItemSummariesByItemIds", () => {
  it("keeps requested identities and measures full visible bursts without exposing hidden covers", async () => {
    const { database, b2, close } = await createTestApp();
    try {
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
      const ids = await [0, 1, 2, 3].reduce(async (previous, index) => {
        const itemIds = await previous;
        const itemId = await insertItem(database, {
          uploadedBy: uploader,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_at: `2026-09-27T12:00:0${index}.000Z`,
          ...(index === 3 ? { visibility_rule_id: hiddenRule } : {}),
        });
        await insertRendition(database, { itemId });
        return [...itemIds, itemId];
      }, Promise.resolve<string[]>([]));
      await setBurstCover(database, { burstId, coverItemId: ids[3]! });
      await insertItemView(database, { memberId, itemId: ids[1]! });
      const personId = await insertPerson(database, {
        displayName: "Robin",
        member_id: memberId,
      });
      await insertItemPerson(database, { itemId: ids[1]!, personId });
      await insertItemPerson(database, { itemId: ids[3]!, personId });
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
        itemIds: [ids[1]!, ids[3]!, brokenId, "missing"],
        now: new Date(NOW),
      });
      expect([...summaries.keys()]).toEqual([ids[1]]);
      const summary = itemSummarySchema.parse(summaries.get(ids[1]!));
      expect(summary).toMatchObject({
        itemId: ids[1],
        isUnseen: false,
        uploadedBy: { memberId: uploader, displayName: "Pat" },
        visibility: { mode: "everyone" },
        burst: {
          burstId,
          visibleFrameCount: 3,
          coverItemId: ids[0],
          startsAt: "2026-09-27T12:00:00.000Z",
          endsAt: "2026-09-27T12:00:02.000Z",
          hasUnseenFrames: true,
        },
      });
      expect(summary.media.altText).toContain("Robin");
      expect(summary.media.thumb.url).toBeTruthy();
      await database
        .updateTable("items")
        .set({ visibility_rule_id: hiddenRule })
        .where("id", "in", [ids[0]!, ids[2]!])
        .execute();
      const singleton = await readItemSummariesByItemIds({
        database,
        b2,
        viewer,
        itemIds: [ids[1]!],
        now: new Date(NOW),
      });
      expect(singleton.get(ids[1]!)?.burst).toBeNull();
    } finally {
      await close();
    }
  });

  it("keeps query count fixed as requested items and bursts grow", async () => {
    const { database, b2, close } = await createTestApp();
    try {
      const memberId = await insertMember(database);
      const uploadSessionId = await insertUploadSession(database, {
        uploadedBy: memberId,
      });
      const ids = await Array.from({ length: 20 }, (_, index) => {
        return index;
      }).reduce(async (previous, index) => {
        const itemIds = await previous;
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
        return [...itemIds, itemId];
      }, Promise.resolve<string[]>([]));
      const counting = makeQueryCountingDatabaseFromDatabase(database);
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
            itemIds: ids.slice(0, 1),
          })
        ).size,
      ).toBe(1);
      const smallCount = counting.getQueryCount();
      counting.reset();
      expect(
        (await readItemSummariesByItemIds({ ...options, itemIds: ids })).size,
      ).toBe(20);
      expect(counting.getQueryCount()).toBe(smallCount);
      expect(smallCount).toBeLessThanOrEqual(10);
      counting.reset();
      expect(
        (await readItemSummariesByItemIds({ ...options, itemIds: [] })).size,
      ).toBe(0);
      expect(counting.getQueryCount()).toBe(0);
    } finally {
      await close();
    }
  });
});
