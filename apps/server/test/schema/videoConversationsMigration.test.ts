import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("upgrades an existing catalog without changing its comments or whole-item reactions", async () => {
  const database = createDatabase(":memory:");
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => {
          return name < "0010";
        }),
      ),
    });
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: 30_000,
    });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
      body: "Existing words",
      at_seconds: 12.5,
    });
    await database
      .insertInto("item_reactions")
      .values({
        id: "existing-reaction",
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: NOW,
      })
      .execute();

    await migrateToLatest(database);

    expect(
      await database
        .selectFrom("comments")
        .selectAll()
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      id: commentId,
      body: "Existing words",
      at_seconds: 12.5,
      parent_comment_id: null,
    });
    expect(
      await database.selectFrom("item_reactions").selectAll().execute(),
    ).toEqual([
      {
        id: "existing-reaction",
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: NOW,
      },
    ]);
    expect(
      await database.selectFrom("video_reactions").selectAll().execute(),
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});
