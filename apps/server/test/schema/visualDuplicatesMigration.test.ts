import { sql } from "kysely";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { readColumns } from "../../src/db/schemaIntrospectionHelpers.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("upgrades populated catalogs without changing media and durably queues only photos", async () => {
  const database = createDatabase(":memory:");
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => {
          return name < "0015";
        }),
      ),
    });
    const memberId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    await insertUploadFile(database, { uploadSessionId: sessionId });
    const photoId = await insertItem(database, {
      uploadedBy: memberId,
      checksum: "a".repeat(64),
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      kind: "video",
      duration_ms: 1000,
    });
    await insertRendition(database, { itemId: photoId, purpose: "original" });
    await insertComment(database, {
      itemId: photoId,
      authorMemberId: memberId,
    });
    const itemsBefore = await database
      .selectFrom("items")
      .selectAll()
      .execute();
    const filesBefore = await database
      .selectFrom("upload_files")
      .selectAll()
      .execute();
    const renditionsBefore = await database
      .selectFrom("item_renditions")
      .selectAll()
      .execute();
    const commentsBefore = await database
      .selectFrom("comments")
      .selectAll()
      .execute();

    await migrateToLatest(database);

    expect(
      (await readColumns({ database, tableName: "items" })).some((column) => {
        return column.name === "visual_fingerprint" && column.isNullable;
      }),
    ).toBe(true);
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      itemsBefore.map((item) => {
        return { ...item, visual_fingerprint: null };
      }),
    );
    expect(
      await database.selectFrom("upload_files").selectAll().execute(),
    ).toEqual(
      filesBefore.map((file) => {
        return { ...file, visual_fingerprint: null, pick_id: null };
      }),
    );
    expect(
      await database.selectFrom("item_renditions").selectAll().execute(),
    ).toEqual(renditionsBefore);
    expect(await database.selectFrom("comments").selectAll().execute()).toEqual(
      commentsBefore,
    );
    expect(
      (await sql`select * from photo_fingerprint_backfill`.execute(database))
        .rows,
    ).toEqual([
      {
        item_id: photoId,
        attempts: 0,
        next_attempt_at: "1970-01-01T00:00:00.000Z",
        last_error: null,
      },
    ]);
    await database.deleteFrom("items").where("id", "=", photoId).execute();
    expect(
      (await sql`select * from photo_fingerprint_backfill`.execute(database))
        .rows,
    ).toEqual([]);
    expect(
      (await sql`pragma foreign_key_check`.execute(database)).rows,
    ).toEqual([]);
    expect(await migrateToLatest(database)).toEqual([]);
  } finally {
    await database.destroy();
  }
});

it.each([0, 1, 2, 3])(
  "uses the photo-only expression index for fingerprint band %s",
  async (band) => {
    const database = createDatabase(":memory:");
    try {
      await migrateToLatest(database);
      const indexes = await sql<{
        name: string;
      }>`select name from sqlite_master where type = 'index' and name = ${`items_visual_fingerprint_band_${band}`}`.execute(
        database,
      );
      expect(indexes.rows).toHaveLength(1);
      const plan = await sql<{
        detail: string;
      }>`explain query plan select id from items
      where kind = 'photo' and visual_fingerprint is not null
      and substr(visual_fingerprint, ${sql.lit(4 + 4 * band)}, 4) = 'abcd'`.execute(
        database,
      );
      expect(
        plan.rows.some((row) => {
          return row.detail.includes(`items_visual_fingerprint_band_${band}`);
        }),
      ).toBe(true);
    } finally {
      await database.destroy();
    }
  },
);

it("permits legacy selection IDs and enforces unique declared selection identities per session", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    expect(
      (await readColumns({ database, tableName: "upload_files" })).some(
        (column) => {
          return column.name === "pick_id" && column.isNullable;
        },
      ),
    ).toBe(true);
    const memberId = await insertMember(database);
    const firstSession = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const secondSession = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    await insertUploadFile(database, {
      uploadSessionId: firstSession,
      pick_id: "selection-1",
    });
    await expect(
      insertUploadFile(database, {
        uploadSessionId: firstSession,
        position: 1,
        pick_id: "selection-1",
      }),
    ).rejects.toThrow(/UNIQUE/);
    await insertUploadFile(database, {
      uploadSessionId: secondSession,
      pick_id: "selection-1",
    });
    await insertUploadFile(database, {
      uploadSessionId: firstSession,
      position: 2,
    });
    await insertUploadFile(database, {
      uploadSessionId: firstSession,
      position: 3,
    });
    expect(
      await database.selectFrom("upload_files").select("id").execute(),
    ).toHaveLength(4);
  } finally {
    await database.destroy();
  }
});
