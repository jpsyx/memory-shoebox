import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { readDetail } from "./readItemDetailTestHelpers.ts";

describe("what readItemDetail's payload carries", () => {
  it("composes alt text from the people and the date, and keeps the override apart", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database, { display_name: "Papá" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      captured_at: "2026-09-14T04:41:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId: mateoId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(detail.media.altText).toBe("Mateo, 14 September 2026");
    expect(detail.altTextOverride).toBeNull();
    expect(detail.people).toEqual([
      { personId: mateoId, displayName: "Mateo" },
    ]);
    await database.destroy();
  });

  it("reports the state the viewer arrived in", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const unseenId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const seenId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    await Promise.all([
      insertRendition(database, { itemId: unseenId }),
      insertRendition(database, { itemId: seenId }),
    ]);
    await insertItemView(database, { memberId, itemId: seenId });
    const viewer = makeViewer({ memberId });

    expect(
      (await readDetail({ database, viewer, itemId: unseenId })).isUnseen,
    ).toBe(true);
    expect(
      (await readDetail({ database, viewer, itemId: seenId })).isUnseen,
    ).toBe(false);
    await database.destroy();
  });

  it("says whether an attached milestone's span still contains the item", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const insideId = await insertMilestone(database, {
      name: "The birthday",
      startsOn: "2026-09-14",
    });
    const outsideId = await insertMilestone(database, {
      name: "A week at the grandparents'",
      startsOn: "2026-08-01",
      endsOn: "2026-08-08",
    });
    await insertItemMilestone(database, { itemId, milestoneId: insideId });
    await insertItemMilestone(database, { itemId, milestoneId: outsideId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(
      detail.milestones.map((milestone) => {
        return [milestone.name, milestone.spanContainsCapturedOn];
      }),
    ).toEqual(
      expect.arrayContaining([
        ["The birthday", true],
        ["A week at the grandparents'", false],
      ]),
    );
    await database.destroy();
  });

  it("offers the ask to a tagged viewer and withholds it from the uploader", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const taggedMemberId = await insertMember(database, { role: "viewer" });
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const personId = await insertPerson(database, {
      displayName: "Marisol",
      member_id: taggedMemberId,
    });
    await insertItemPerson(database, { itemId, personId });

    const forTagged = await readDetail({
      database,
      viewer: makeViewer({ memberId: taggedMemberId, role: "viewer" }),
      itemId,
    });
    const forUploader = await readDetail({
      database,
      viewer: makeViewer({ memberId: uploaderId }),
      itemId,
    });

    expect(forTagged.capabilities.canRequestRemoval).toBe(true);
    expect(forTagged.capabilities.canDelete).toBe(false);
    expect(forUploader.capabilities.canRequestRemoval).toBe(false);
    expect(forUploader.capabilities.canDelete).toBe(true);
    await database.destroy();
  });

  it("carries the tags and the rule's id, so the controls can pre-fill", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const tagId = await insertTag(database, { name: "Hospital" });
    await insertItemTag(database, { itemId, tagId });

    const detail = await readDetail({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(detail.tags).toEqual([{ tagId, name: "Hospital" }]);
    expect(detail.visibility.visibilityRuleId).toBe("visibility-rule-everyone");
    await database.destroy();
  });

  it("refuses to serve a video whose duration was never written", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: null,
    });
    await insertRendition(database, { itemId });

    await expect(
      readDetail({ database, viewer: makeViewer({ memberId }), itemId }),
    ).rejects.toThrow(/duration/iu);
    await database.destroy();
  });
});
