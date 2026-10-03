import { createUploadTestContext } from "./createUploadTestContext.ts";

import { describe, expect, it } from "vitest";

import {
  insertMilestone,
  insertTag,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("ingestUploadFile", () => {
  it("writes the item from the file row, with the session's rule copied on", async () => {
    const { database, memberId, ruleId, session, seedFile, ingest } =
      await createUploadTestContext();
    const file = await seedFile({ position: 1 });

    const { itemId } = await ingest({ file: file });

    expect(
      await database
        .selectFrom("items")
        .selectAll()
        .where("id", "=", itemId)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      id: itemId,
      kind: "photo",
      captured_at: "2026-09-14T04:41:32.000Z",
      captured_at_offset_minutes: 120,
      captured_on: "2026-09-14",
      capture_source: "uploader_set",
      // What the file said, not the correction: revert still means the file.
      original_captured_at: "2026-09-13T04:41:32.000Z",
      seq: 1,
      uploaded_by: memberId,
      upload_session_id: session.id,
      visibility_rule_id: ruleId,
      burst_id: null,
      burst_index: null,
      width: 3024,
      height: 4032,
      duration_ms: null,
      byte_size: 2_400_000,
      content_type: "image/jpeg",
      checksum: file.content_hash,
      original_filename: "IMG_0001.jpg",
      alt_text: null,
      created_at: NOW,
    });
    await database.destroy();
  });

  it("numbers items in arrival order", async () => {
    const { database, seedFile, ingest } = await createUploadTestContext();

    const first = await ingest({ file: await seedFile({ position: 1 }) });
    const second = await ingest({ file: await seedFile({ position: 2 }) });

    const rows = await database
      .selectFrom("items")
      .select(["id", "seq"])
      .orderBy("seq", "asc")
      .execute();
    expect(rows).toEqual([
      { id: first.itemId, seq: 1 },
      { id: second.itemId, seq: 2 },
    ]);
    await database.destroy();
  });

  it("keeps one rendition row per verified purpose, keys only, and links the file", async () => {
    const { database, keyOf, seedFile, ingest } =
      await createUploadTestContext();
    const file = await seedFile({ position: 1 });

    const { itemId } = await ingest({ file: file });

    expect(
      await database
        .selectFrom("item_renditions")
        .select([
          "purpose",
          "storage_key",
          "content_type",
          "byte_size",
          "width",
          "height",
        ])
        .where("item_id", "=", itemId)
        .orderBy("purpose", "asc")
        .execute(),
    ).toEqual([
      {
        purpose: "original",
        storage_key: keyOf({ fileId: file.id, purpose: "original" }),
        content_type: "image/jpeg",
        byte_size: 2_400_000,
        width: 3024,
        height: 4032,
      },
      {
        purpose: "thumb",
        storage_key: keyOf({ fileId: file.id, purpose: "thumb" }),
        content_type: "image/jpeg",
        byte_size: 40_000,
        width: 360,
        height: 480,
      },
    ]);
    const linked = await database
      .selectFrom("upload_files")
      .select("item_id")
      .where("id", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(linked.item_id).toBe(itemId);
    await database.destroy();
  });

  it("makes a typed tag once for the batch, and reuses one the archive spells differently", async () => {
    const { database, memberId, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const existingId = await insertTag(database, { name: "hospital" });
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    const hospitalEdit = await planEdit({
      files: [first, second],
      edit: { label_snapshot: "Hospital" },
    });
    const homeEdit = await planEdit({
      files: [first, second],
      edit: { label_snapshot: "Home" },
    });

    await ingest({ file: first });
    await ingest({ file: second });

    const tags = await database
      .selectFrom("tags")
      .select(["id", "name", "created_by"])
      .orderBy("name", "asc")
      .execute();
    expect(
      tags.map((tag) => {
        return tag.name;
      }),
    ).toEqual(["Home", "hospital"]);
    const homeTag = tags.find((tag) => {
      return tag.name === "Home";
    });
    expect(homeTag?.created_by).toBe(memberId);
    expect(await readEdit(hospitalEdit)).toMatchObject({
      tag_id: existingId,
      applied_at: NOW,
    });
    expect(await readEdit(homeEdit)).toMatchObject({
      tag_id: homeTag?.id,
      applied_at: NOW,
    });
    expect(
      await database.selectFrom("item_tags").select("id").execute(),
    ).toHaveLength(4);
    await database.destroy();
  });

  it("makes a typed person once, for every edit in the batch that typed that name", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    const onFirst = await planEdit({
      files: [first],
      edit: { kind: "person", label_snapshot: "Mateo" },
    });
    const onSecond = await planEdit({
      files: [second],
      edit: { kind: "person", label_snapshot: "mateo" },
    });

    await ingest({ file: first });
    await ingest({ file: second });

    const people = await database
      .selectFrom("people")
      .select(["id", "display_name"])
      .execute();
    expect(people).toEqual([{ id: people[0]?.id, display_name: "Mateo" }]);
    expect((await readEdit(onFirst)).person_id).toBe(people[0]?.id);
    expect((await readEdit(onSecond)).person_id).toBe(people[0]?.id);
    expect(
      await database.selectFrom("item_people").select("person_id").execute(),
    ).toEqual([{ person_id: people[0]?.id }, { person_id: people[0]?.id }]);
    await database.destroy();
  });

  it("applies a picked tag and a milestone once each, and skips an undone edit", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const tagId = await insertTag(database, { name: "Beach" });
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-14",
    });
    const file = await seedFile({ position: 1 });
    await planEdit({
      files: [file],
      edit: { tag_id: tagId, label_snapshot: null },
    });
    // The same action twice is allowed and harmless.
    await planEdit({
      files: [file],
      edit: { tag_id: tagId, label_snapshot: null },
    });
    await planEdit({
      files: [file],
      edit: {
        kind: "milestone",
        milestone_id: milestoneId,
        label_snapshot: null,
      },
    });
    const undoneEdit = await planEdit({
      files: [file],
      edit: { label_snapshot: "Never", undone_at: NOW },
    });

    const { itemId } = await ingest({ file: file });

    expect(
      await database
        .selectFrom("item_tags")
        .select("tag_id")
        .where("item_id", "=", itemId)
        .execute(),
    ).toEqual([{ tag_id: tagId }]);
    expect(
      await database
        .selectFrom("item_milestones")
        .select("milestone_id")
        .where("item_id", "=", itemId)
        .execute(),
    ).toEqual([{ milestone_id: milestoneId }]);
    expect(await database.selectFrom("tags").select("name").execute()).toEqual([
      { name: "Beach" },
    ]);
    expect((await readEdit(undoneEdit)).applied_at).toBeNull();
    await database.destroy();
  });

  it("names only the tags this file's edits carry, not the whole batch's", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    await planEdit({ files: [first], edit: { label_snapshot: "Hospital" } });
    const onSecond = await planEdit({
      files: [second],
      edit: { label_snapshot: "Beach" },
    });

    // The second file is never ingested: refused, failed or cancelled.
    await ingest({ file: first });

    expect(await database.selectFrom("tags").select("name").execute()).toEqual([
      { name: "Hospital" },
    ]);
    expect(await readEdit(onSecond)).toMatchObject({
      tag_id: null,
      applied_at: null,
    });
    await database.destroy();
  });
});
