import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { createId } from "../../../src/db/createId.ts";
import {
  NOW,
  insertBurst,
  insertComment,
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
  insertUploadFile,
  insertUploadSession,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { runDelete } from "./deleteItemTestHelpers.ts";

describe("what deleteItem takes down with the item", () => {
  it("drops the burst when its last frame goes, and not before", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-27",
    });
    const firstId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      burst_index: 0,
      seq: 1,
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      burst_index: 1,
      seq: 2,
    });

    await runDelete({ database, memberId, itemId: firstId });

    // Deleting one frame of forty-five is ordinary, and the burst stands.
    expect(
      await database.selectFrom("bursts").selectAll().execute(),
    ).toHaveLength(1);

    await runDelete({ database, memberId, itemId: secondId });

    // No foreign key direction does this.
    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("takes the comments, reactions, tags, people and views with it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: uploadSessionId,
    });
    const uploadFileId = await insertUploadFile(database, {
      uploadSessionId,
      item_id: itemId,
    });
    const tagId = await insertTag(database, { name: "Hospital" });
    await insertItemTag(database, { itemId, tagId });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });
    const milestoneId = await insertMilestone(database, {
      name: "The christening",
      startsOn: "2026-09-27",
    });
    await insertItemMilestone(database, { itemId, milestoneId });
    await insertItemView(database, { memberId, itemId });
    await insertRendition(database, { itemId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
    });
    await database
      .insertInto("comment_reactions")
      .values({
        id: createId(),
        comment_id: commentId,
        member_id: memberId,
        kind: "like",
        created_at: NOW,
      })
      .execute();
    await database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: NOW,
      })
      .execute();
    await database
      .insertInto("item_capture_date_changes")
      .values({
        id: createId(),
        item_id: itemId,
        milestone_id: null,
        previous_captured_at: NOW,
        previous_capture_date: "2026-09-26",
        previous_capture_source: "exif",
        new_captured_at: NOW,
        new_capture_date: "2026-09-27",
        changed_by: memberId,
        changed_at: NOW,
        reason: "manual",
      })
      .execute();

    await runDelete({ database, memberId, itemId });

    const countRowsIn = async (
      table:
        | "comments"
        | "comment_reactions"
        | "item_reactions"
        | "item_tags"
        | "item_people"
        | "item_milestones"
        | "item_views"
        | "item_renditions"
        | "item_capture_date_changes",
    ) => {
      return (await database.selectFrom(table).selectAll().execute()).length;
    };

    // `comment_reactions` goes transitively, through the comment.
    expect(
      await Promise.all([
        countRowsIn("comments"),
        countRowsIn("comment_reactions"),
        countRowsIn("item_reactions"),
        countRowsIn("item_tags"),
        countRowsIn("item_people"),
        countRowsIn("item_milestones"),
        countRowsIn("item_views"),
        countRowsIn("item_renditions"),
        countRowsIn("item_capture_date_changes"),
      ]),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);

    // The rows that keep somebody findable after their only photograph comes
    // down, and the occasion that is now allowed to be empty.
    expect(
      await database.selectFrom("tags").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("people").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("milestones").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("members").selectAll().execute(),
    ).toHaveLength(1);

    // The transfer record outlives the photograph.
    const uploadFile = await database
      .selectFrom("upload_files")
      .selectAll()
      .where("id", "=", uploadFileId)
      .executeTakeFirstOrThrow();
    expect(uploadFile.item_id).toBeNull();

    // Rules are shared, and a daily sweep drops the ones nothing references.
    expect(
      await database.selectFrom("visibility_rules").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });
});
