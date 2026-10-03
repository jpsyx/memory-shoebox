import { createUploadTestContext } from "./createUploadTestContext.ts";

import { describe, expect, it } from "vitest";

import {
  insertItem,
  insertPerson,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("ingestUploadFile", () => {
  it("makes only the people this file's edits name, not the whole batch's", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    await planEdit({
      files: [first],
      edit: { kind: "person", label_snapshot: "Mateo" },
    });
    const onSecond = await planEdit({
      files: [second],
      edit: { kind: "person", label_snapshot: "Lucia" },
    });

    // The second file is never ingested: refused, failed or cancelled.
    await ingest({ file: first });

    expect(
      await database.selectFrom("people").select("display_name").execute(),
    ).toEqual([{ display_name: "Mateo" }]);
    expect(await readEdit(onSecond)).toMatchObject({
      person_id: null,
      applied_at: null,
    });
    await database.destroy();
  });

  it("makes a person for a name a later file needs, and reuses one an earlier file made", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    const third = await seedFile({ position: 3 });
    const onFirst = await planEdit({
      files: [first],
      edit: { kind: "person", label_snapshot: "Mateo" },
    });
    const onSecondAndThird = await planEdit({
      files: [second, third],
      edit: { kind: "person", label_snapshot: "Lucia" },
    });
    const onThirdToo = await planEdit({
      files: [third],
      edit: { kind: "person", label_snapshot: "lucia" },
    });

    await ingest({ file: first });
    await ingest({ file: second });
    await ingest({ file: third });

    const people = await database
      .selectFrom("people")
      .select(["id", "display_name"])
      .orderBy("display_name", "asc")
      .execute();
    expect(
      people.map((person) => {
        return person.display_name;
      }),
    ).toEqual(["Lucia", "Mateo"]);
    const lucia = people.find((person) => {
      return person.display_name === "Lucia";
    });
    expect((await readEdit(onFirst)).person_id).toBe(
      people.find((person) => {
        return person.display_name === "Mateo";
      })?.id,
    );
    expect((await readEdit(onSecondAndThird)).person_id).toBe(lucia?.id);
    expect((await readEdit(onThirdToo)).person_id).toBe(lucia?.id);
    await database.destroy();
  });

  it("links a picked person without making another", async () => {
    const { database, seedFile, ingest, planEdit, readEdit } =
      await createUploadTestContext();
    const personId = await insertPerson(database, { displayName: "Abuela" });
    const file = await seedFile({ position: 1 });
    const editId = await planEdit({
      files: [file],
      edit: { kind: "person", person_id: personId, label_snapshot: null },
    });

    const { itemId } = await ingest({ file: file });

    expect(
      await database
        .selectFrom("item_people")
        .select(["item_id", "person_id"])
        .execute(),
    ).toEqual([{ item_id: itemId, person_id: personId }]);
    expect(await database.selectFrom("people").select("id").execute()).toEqual([
      { id: personId },
    ]);
    expect((await readEdit(editId)).applied_at).toBe(NOW);
    await database.destroy();
  });

  it("writes a video as a video, with its duration", async () => {
    const { database, seedFile, ingest } = await createUploadTestContext();
    const file = await seedFile({
      position: 1,
      overrides: {
        kind: "video",
        declared_content_type: "video/quicktime",
        original_filename: "MVI_0001.mov",
      },
    });

    const { itemId } = await ingest({
      file: file,
      dimensions: {
        width: 1920,
        height: 1080,
        durationMs: 12_500,
      },
    });

    expect(
      await database
        .selectFrom("items")
        .select(["kind", "content_type", "width", "height", "duration_ms"])
        .where("id", "=", itemId)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      kind: "video",
      content_type: "video/quicktime",
      width: 1920,
      height: 1080,
      duration_ms: 12_500,
    });
    await database.destroy();
  });

  it("continues the numbering after the items already in the archive", async () => {
    const { database, memberId, seedFile, ingest } =
      await createUploadTestContext();
    await insertItem(database, { uploadedBy: memberId, seq: 7 });
    await insertItem(database, { uploadedBy: memberId, seq: 41 });

    const { itemId } = await ingest({ file: await seedFile({ position: 1 }) });

    expect(
      await database
        .selectFrom("items")
        .select("seq")
        .where("id", "=", itemId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ seq: 42 });
    await database.destroy();
  });

  it("refuses a file whose kind was never decided, rather than guessing a photo", async () => {
    const { database, seedFile, ingest } = await createUploadTestContext();
    const file = await seedFile({ position: 1, overrides: { kind: null } });

    await expect(ingest({ file: file })).rejects.toThrow(/reached ingest/);

    expect(await database.selectFrom("items").select("id").execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("refuses a file with no frozen original date, rather than using the amended one", async () => {
    const { database, seedFile, ingest } = await createUploadTestContext();
    const file = await seedFile({
      position: 1,
      overrides: { original_captured_at: null },
    });

    await expect(ingest({ file: file })).rejects.toThrow(/reached ingest/);

    expect(await database.selectFrom("items").select("id").execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("writes no links for a file no edit targets", async () => {
    const { database, seedFile, ingest } = await createUploadTestContext();

    await ingest({ file: await seedFile({ position: 1 }) });

    expect(
      await database.selectFrom("item_tags").select("id").execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("item_people").select("id").execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("item_milestones").select("id").execute(),
    ).toEqual([]);
    await database.destroy();
  });
});
