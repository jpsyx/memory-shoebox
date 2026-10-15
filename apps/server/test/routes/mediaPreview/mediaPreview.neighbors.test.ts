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
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMediaPreviewContext,
  getItemIdsFromNeighborResponse,
  installMediaPreviewTestLifecycle,
  seedMediaPreviewBurst,
  SELECTION,
} from "./mediaPreviewTestHelpers.ts";
installMediaPreviewTestLifecycle();
describe("side-effect-free media reads", () => {
  it("enters exact burst edges and keeps null indices last, independent of capture order", async () => {
    const context = await createMediaPreviewContext();
    const { before, after, frameIds } = await seedMediaPreviewBurst(context);
    const neighbors = async (itemId: string, direction = "next") => {
      return getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId,
            direction,
            selection: SELECTION,
          })
        ).json(),
      );
    };
    expect(await neighbors(before)).toEqual({
      ahead: [frameIds[1], frameIds[2]],
      behind: [],
    });
    expect(await neighbors(after, "previous")).toEqual({
      ahead: [frameIds[3], frameIds[0]],
      behind: [],
    });
    expect(await neighbors(frameIds[0]!)).toEqual({
      ahead: [frameIds[3], after],
      behind: [frameIds[2]],
    });
    expect(await neighbors(frameIds[1]!, "previous")).toEqual({
      ahead: [before],
      behind: [frameIds[2]],
    });
  });
});
describe("side-effect-free media reads", () => {
  it("uses visible burst anchors, partial visibility and every selection filter", async () => {
    const context = await createMediaPreviewContext();
    const { before, after, frameIds } = await seedMediaPreviewBurst(context);
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: rule })
      .where("id", "=", frameIds[1]!)
      .execute();
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: before,
            direction: "next",
            selection: SELECTION,
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[2], frameIds[0]]);
    const tagId = await insertTag(context.database, { name: "tag" });
    const personId = await insertPerson(context.database, {
      displayName: "person",
    });
    const milestoneId = await insertMilestone(context.database, {
      name: "occasion",
      startsOn: "2026-09-27",
    });
    await Promise.all(
      [before, frameIds[3]!, after].map(async (itemId) => {
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
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: before,
            direction: "next",
            selection,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [frameIds[3], after], behind: [] });
    expect(
      (
        await context.post("neighbors", {
          itemId: before,
          direction: "next",
          selection: { ...selection, excludeAttached: true },
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });
});
describe("side-effect-free media reads", () => {
  it("breaks equal timestamps by sequence and crosses days newest first", async () => {
    const context = await createMediaPreviewContext();
    const first = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 10,
    });
    const second = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 20,
    });
    const older = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_on: "2026-09-25",
      captured_at: "2026-09-25T10:00:00.000Z",
      seq: 30,
    });
    const newer = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      captured_on: "2026-09-29",
      captured_at: "2026-09-29T10:00:00.000Z",
      seq: 40,
    });
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: second,
            direction: "next",
            selection: SELECTION,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [older], behind: [first] });
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: first,
            direction: "previous",
            selection: SELECTION,
          })
        ).json(),
      ),
    ).toEqual({ ahead: [newer], behind: [second] });
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: first,
            direction: "previous",
            selection: { ...SELECTION, until: "2026-09-27" },
          })
        ).json(),
      ),
    ).toEqual({ ahead: [], behind: [second] });
    await context.database
      .deleteFrom("items")
      .where("id", "=", first)
      .execute();
    expect(
      (
        await context.post("neighbors", {
          itemId: first,
          direction: "next",
          selection: SELECTION,
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });
});
describe("side-effect-free media reads", () => {
  it("moves a partially visible stack to its earliest visible frame", async () => {
    const context = await createMediaPreviewContext();
    const { before, frameIds } = await seedMediaPreviewBurst(context);
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: rule })
      .where("id", "=", frameIds[0]!)
      .execute();
    const between = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 50,
      captured_at: "2026-09-27T12:00:30.000Z",
    });
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: before,
            selection: SELECTION,
            direction: "next",
          })
        ).json(),
      ).ahead,
    ).toEqual([between, frameIds[1]]);
  });
});
describe("side-effect-free media reads", () => {
  it("breaks equal burst indices by ID in both directions", async () => {
    const context = await createMediaPreviewContext();
    const { before, frameIds } = await seedMediaPreviewBurst(context);
    await context.database
      .updateTable("items")
      .set({ burst_index: 1 })
      .where("id", "=", frameIds[2]!)
      .execute();
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: before,
            selection: SELECTION,
            direction: "next",
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[1], frameIds[2]]);
    expect(
      getItemIdsFromNeighborResponse(
        (
          await context.post("neighbors", {
            itemId: frameIds[2],
            selection: SELECTION,
            direction: "previous",
          })
        ).json(),
      ).ahead,
    ).toEqual([frameIds[1], before]);
  });
});
