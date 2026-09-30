import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { deleteItem } from "../../src/items/deleteItem.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
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
  insertRemovalRequest,
  insertRendition,
  insertTag,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/**
 * Deletes one item the way the route does: resolve it, then run the whole
 * transaction over the row that came back.
 */
const runDelete = async (options: {
  database: Kysely<Database>;
  memberId: string;
  itemId: string;
}) => {
  const viewer = makeViewer({ memberId: options.memberId });
  const item = await getVisibleItemOr404({
    database: options.database,
    viewer,
    itemId: options.itemId,
  });
  await runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return deleteItem({ transaction, viewer, item, now: NOW });
    },
  });
};

describe("deleteItem", () => {
  it("enqueues one object delete per rendition, in the same transaction", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await Promise.all(
      (["original", "display", "thumb"] as const).map((purpose) => {
        return insertRendition(database, { itemId, purpose });
      }),
    );

    await runDelete({ database, memberId, itemId });

    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .execute();
    expect(
      queued
        .map((row) => {
          return row.storage_key;
        })
        .sort(),
    ).toEqual([
      `items/${itemId}/display.jpg`,
      `items/${itemId}/original.jpg`,
      `items/${itemId}/thumb.jpg`,
    ]);
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("enqueues nothing when the transaction rolls back", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const viewer = makeViewer({ memberId });
    const item = await getVisibleItemOr404({ database, viewer, itemId });

    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await deleteItem({ transaction, viewer, item, now: NOW });
          throw new Error("something later in the transaction failed");
        },
      }),
    ).rejects.toThrow();

    // The rows must commit first so the item genuinely vanishes, and the
    // two halves must never disagree: no item deleted, no object enqueued.
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("closes every open removal request on the item, not only one", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const inesId = await insertMember(database);
    const mateoId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    const openByInes = await insertRemovalRequest(database, {
      requestedByMemberId: inesId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
      state: "open",
      decline_reason: null,
      resolved_at: null,
      resolved_by_member_id: null,
    });
    const openByMateo = await insertRemovalRequest(database, {
      requestedByMemberId: mateoId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
      state: "open",
      decline_reason: null,
      resolved_at: null,
      resolved_by_member_id: null,
    });
    // Already settled, and this delete does not re-answer it.
    const alreadyDeclined = await insertRemovalRequest(database, {
      requestedByMemberId: inesId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
    });

    await runDelete({ database, memberId: uploaderId, itemId });

    const rows = await database
      .selectFrom("removal_requests")
      .selectAll()
      .execute();
    const byId = new Map(
      rows.map((row) => {
        return [row.id, row];
      }),
    );

    // Two cousins asked, and one delete answered both.
    [openByInes, openByMateo].forEach((requestId) => {
      expect(byId.get(requestId)).toMatchObject({
        state: "deleted",
        resolved_at: NOW,
        resolved_by_member_id: uploaderId,
        // Nulled by the cascade afterwards, so the takedown history survives
        // the takedown.
        item_id: null,
      });
    });
    expect(byId.get(alreadyDeclined)).toMatchObject({
      state: "declined",
      item_id: null,
    });
    await database.destroy();
  });

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

  it("writes the one audit row that is the only record the item existed", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: 4200,
      captured_on: "2026-09-14",
    });

    await runDelete({ database, memberId, itemId });

    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      kind: "item_deleted",
      subject_kind: "item",
      // A dangling id by design: nothing else names the photograph now.
      subject_id: itemId,
      subject_label: "A video from 2026-09-14",
      occurred_at: NOW,
      actor_member_id: memberId,
    });
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
