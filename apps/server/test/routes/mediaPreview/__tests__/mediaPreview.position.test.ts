import type { TimelineSelection } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMilestone,
  insertPerson,
  insertTag,
  insertVisibilityRule,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMediaPreviewContext,
  getMediaSideEffectsFromDatabase,
  installMediaPreviewTestLifecycle,
  seedMediaPreviewBurst,
  SELECTION,
} from "./mediaPreviewTestHelpers.ts";

installMediaPreviewTestLifecycle();
type Context = Awaited<ReturnType<typeof createMediaPreviewContext>>;
async function _walkNeighbors(
  options: Readonly<{
    context: Context;
    itemId: string;
    selection: TimelineSelection;
  }>,
): Promise<string[]> {
  const response = await options.context.post({
    path: "neighbors",
    payload: {
      itemId: options.itemId,
      selection: options.selection,
      direction: "next",
    },
  });
  expect(response.statusCode).toBe(200);
  const ahead = response.json<{ ahead: Array<{ itemId: string }> }>().ahead[0];
  return ahead === undefined
    ? [options.itemId]
    : [
        options.itemId,
        ...(await _walkNeighbors({ ...options, itemId: ahead.itemId })),
      ];
}
async function _expectPositions(
  options: Readonly<{
    context: Context;
    firstId: string;
    selection: TimelineSelection;
    expectedIds: string[];
  }>,
): Promise<void> {
  const beforeSideEffects = await getMediaSideEffectsFromDatabase(
    options.context.database,
  );
  const walkedIds = await _walkNeighbors({
    context: options.context,
    itemId: options.firstId,
    selection: options.selection,
  });
  expect(walkedIds).toEqual(options.expectedIds);
  await Promise.all(
    walkedIds.map(async (itemId, index) => {
      const response = await options.context.post({
        path: "position",
        payload: { itemId, selection: options.selection },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({
        position: index + 1,
        total: walkedIds.length,
      });
    }),
  );
  expect(
    await getMediaSideEffectsFromDatabase(options.context.database),
  ).toEqual(beforeSideEffects);
}

describe("authorized media position", () => {
  it("matches neighbor traversal across mixed media, burst ties, null indices and days", async () => {
    const context = await createMediaPreviewContext();
    const { before, after, frameIds } = await seedMediaPreviewBurst(context);
    await context.database
      .updateTable("items")
      .set({ burst_index: 1 })
      .where("id", "=", frameIds[2]!)
      .execute();
    await context.database
      .updateTable("items")
      .set({ kind: "video" })
      .where("id", "=", frameIds[0]!)
      .execute();
    const older = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_on: "2026-09-25",
      captured_at: "2026-09-25T20:00:00.000Z",
      seq: 30,
    });
    const newer = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      kind: "video",
      captured_on: "2026-09-29",
      captured_at: "2026-09-29T10:00:00.000Z",
      seq: 40,
    });
    const tied = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_at: "2026-09-27T13:00:00.000Z",
      seq: 21,
    });
    await _expectPositions({
      context,
      firstId: newer,
      selection: SELECTION,
      expectedIds: [
        newer,
        tied,
        after,
        frameIds[1]!,
        frameIds[2]!,
        frameIds[0]!,
        frameIds[3]!,
        before,
        older,
      ],
    });
  });
  it("counts only visible matching frames with every timeline filter", async () => {
    const context = await createMediaPreviewContext();
    const { before, after, frameIds } = await seedMediaPreviewBurst(context);
    const ruleId = await insertVisibilityRule(context.database, {
      mode: "only",
    });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", frameIds[0]!)
      .execute();
    const tagId = await insertTag(context.database, { name: "trip" });
    const personId = await insertPerson(context.database, {
      displayName: "traveler",
    });
    const milestoneId = await insertMilestone(context.database, {
      name: "occasion",
      startsOn: "2026-09-27",
    });
    await Promise.all(
      [before, frameIds[0]!, frameIds[3]!, after].map(async (itemId) => {
        await insertItemTag(context.database, { itemId, tagId });
        await insertItemPerson(context.database, { itemId, personId });
        await insertItemMilestone(context.database, { itemId, milestoneId });
      }),
    );
    const selection = {
      tags: [tagId],
      people: [personId],
      from: "2026-09-27",
      until: "2026-09-27",
      attachedToMilestoneId: milestoneId,
    };
    await _expectPositions({
      context,
      firstId: after,
      selection,
      expectedIds: [after, frameIds[3]!, before],
    });
    const refused = [
      frameIds[0]!,
      frameIds[1]!,
      "018f0000-0000-7000-8000-00000000ffff",
    ];
    await Promise.all(
      refused.map(async (itemId) => {
        const response = await context.post({
          path: "position",
          payload: { itemId, selection },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toBeNull();
      }),
    );
    const response = await context.post({
      path: "position",
      payload: {
        itemId: after,
        selection: { ...selection, excludeAttached: true },
      },
    });
    expect(response.json()).toBeNull();
  });
  it("moves a partially hidden burst to its earliest visible capture", async () => {
    const context = await createMediaPreviewContext();
    const { before, after, frameIds } = await seedMediaPreviewBurst(context);
    const ruleId = await insertVisibilityRule(context.database, {
      mode: "only",
    });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", frameIds[0]!)
      .execute();
    const between = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 50,
      captured_at: "2026-09-27T12:00:30.000Z",
    });
    await _expectPositions({
      context,
      firstId: after,
      selection: SELECTION,
      expectedIds: [
        after,
        frameIds[1]!,
        frameIds[2]!,
        frameIds[3]!,
        between,
        before,
      ],
    });
  });
  it("authenticates, validates requests and returns null for deleted or date-excluded items", async () => {
    const context = await createMediaPreviewContext();
    const itemId = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
    });
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/media/position",
          payload: { itemId, selection: SELECTION },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await context.post({
          path: "position",
          payload: { itemId: "bad", selection: SELECTION },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await context.post({
          path: "position",
          payload: { itemId, selection: { ...SELECTION, until: "2026-09-26" } },
        })
      ).json(),
    ).toBeNull();
    await context.database
      .deleteFrom("items")
      .where("id", "=", itemId)
      .execute();
    expect(
      (
        await context.post({
          path: "position",
          payload: { itemId, selection: SELECTION },
        })
      ).json(),
    ).toBeNull();
  });
});
