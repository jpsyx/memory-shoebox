import { burstFramesResponseSchema } from "@memory-shoebox/shared";
import { describe, expect, it, onTestFinished } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _insertSelectionLabels(
  database: TestApp["database"],
  frameIds: readonly string[],
) {
  const tagId = await insertTag(database, { name: "Beach" });
  const personId = await insertPerson(database, { displayName: "Alex" });
  const milestoneId = await insertMilestone(database, {
    name: "Holiday",
    startsOn: "2026-09-14",
  });
  await Promise.all(
    [frameIds[0]!, frameIds[2]!].map((itemId) => {
      return insertItemTag(database, { itemId, tagId });
    }),
  );
  await Promise.all(
    [frameIds[0]!, frameIds[1]!].map(async (itemId) => {
      await insertItemPerson(database, { itemId, personId });
      await insertItemMilestone(database, { itemId, milestoneId });
    }),
  );
  return { tagId, personId, milestoneId };
}

async function _makeSelectionContext() {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  onTestFinished(context.close);
  const { database } = context;
  const { cookie } = await insertSignedInMember({ database });
  const uploadedBy = await insertMember(database);
  const uploadSessionId = await insertUploadSession(database, { uploadedBy });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-14",
  });
  const frameIds = await Promise.all(
    [1, 2, 3].map(async (position) => {
      const itemId = await insertItem(database, {
        uploadedBy,
        seq: position,
        burst_id: burstId,
        burst_index: position,
        captured_on: "2026-09-14",
      });
      await insertRendition(database, { itemId });
      return itemId;
    }),
  );
  const labels = await _insertSelectionLabels(database, frameIds);
  const read = (query: URLSearchParams, requestedBurstId = burstId) => {
    return context.app.inject({
      method: "GET",
      url: `/api/bursts/${requestedBurstId}/frames?${query}`,
      headers: { cookie },
    });
  };
  return { ...context, frameIds, ...labels, read };
}

describe("filtered burst frames", () => {
  it("returns only the two matching frames and leaves the excluded frame unseen", async () => {
    const { database, frameIds, tagId, read } = await _makeSelectionContext();
    const response = await read(new URLSearchParams({ tags: tagId }));
    expect(response.statusCode).toBe(200);
    const body = burstFramesResponseSchema.parse(response.json());
    expect(
      body.frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([frameIds[0], frameIds[2]]);
    expect(
      await database
        .selectFrom("item_views")
        .select("item_id")
        .where("item_id", "=", frameIds[1]!)
        .execute(),
    ).toEqual([]);
  });

  it("preserves the filter and dense positions across pages", async () => {
    const { frameIds, tagId, read } = await _makeSelectionContext();
    const query = new URLSearchParams({ tags: tagId, limit: "1" });
    const firstPage = burstFramesResponseSchema.parse(
      (await read(query)).json(),
    );
    expect(
      firstPage.frames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([[frameIds[0], 1]]);
    expect(firstPage.nextCursor).not.toBeNull();
    query.set("cursor", firstPage.nextCursor!);
    const secondPage = burstFramesResponseSchema.parse(
      (await read(query)).json(),
    );
    expect(
      secondPage.frames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([[frameIds[2], 2]]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("intersects tag, people, date and milestone filters", async () => {
    const { frameIds, tagId, personId, milestoneId, read } =
      await _makeSelectionContext();
    const query = new URLSearchParams({
      tags: tagId,
      people: personId,
      from: "2026-09-14",
      until: "2026-09-14",
      attachedToMilestoneId: milestoneId,
    });
    const body = burstFramesResponseSchema.parse((await read(query)).json());
    expect(
      body.frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([frameIds[0]]);
    query.set("from", "2026-09-15");
    expect((await read(query)).statusCode).toBe(404);
    const excluded = await read(
      new URLSearchParams({
        attachedToMilestoneId: milestoneId,
        excludeAttached: "true",
      }),
    );
    expect(
      burstFramesResponseSchema.parse(excluded.json()).frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([frameIds[2]]);
  });

  it("keeps hidden matching frames out of filtered pages", async () => {
    const { database, frameIds, tagId, read } = await _makeSelectionContext();
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", frameIds[0]!)
      .execute();
    const query = new URLSearchParams({ tags: tagId });
    const body = burstFramesResponseSchema.parse((await read(query)).json());
    expect(
      body.frames.map((frame) => {
        return [frame.itemId, frame.position];
      }),
    ).toEqual([[frameIds[2], 1]]);
    await database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", frameIds[2]!)
      .execute();
    const hidden = await read(query);
    const missing = await read(query, createId());
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(missing.body);
  });
});
