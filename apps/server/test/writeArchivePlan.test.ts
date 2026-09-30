// apps/server/test/writeArchivePlan.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { seedMember } from "../scripts/seedMember.ts";
import { ARCHIVE_PLAN } from "../scripts/archiveSeed/archivePlan.ts";
import { writeArchivePlan } from "../scripts/archiveSeed/writeArchivePlan/writeArchivePlan.ts";

async function _seededCatalog() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const uploader = await seedMember({
    database,
    email: "uploader@example.com",
    role: "uploader",
    baseUrl: "http://localhost:5173",
  });
  const viewer = await seedMember({
    database,
    email: "viewer@example.com",
    role: "viewer",
    baseUrl: "http://localhost:5173",
  });
  const written = await writeArchivePlan({
    database,
    plan: ARCHIVE_PLAN,
    uploaderMemberId: uploader.memberId,
    viewerMemberId: viewer.memberId,
  });
  return { database, written, viewerMemberId: viewer.memberId };
}

describe("writeArchivePlan", () => {
  it("writes one row per planned item", async () => {
    const { database, written } = await _seededCatalog();
    const count = await database
      .selectFrom("items")
      .select((builder) => {
        return builder.fn.countAll<number>().as("total");
      })
      .executeTakeFirstOrThrow();
    expect(count.total).toBe(ARCHIVE_PLAN.items.length);
    expect(written.itemCount).toBe(ARCHIVE_PLAN.items.length);
    await database.destroy();
  });

  it("gives every rendition its own storage key, which is uniquely indexed", async () => {
    const { database } = await _seededCatalog();
    const rows = await database
      .selectFrom("item_renditions")
      .select("storage_key")
      .execute();
    expect(
      new Set(
        rows.map((row) => {
          return row.storage_key;
        }),
      ).size,
    ).toBe(rows.length);
    await database.destroy();
  });

  it("restricts the restricted items to a group the viewer is not in", async () => {
    const { database, viewerMemberId } = await _seededCatalog();
    const memberships = await database
      .selectFrom("group_members")
      .select("member_id")
      .where("member_id", "=", viewerMemberId)
      .execute();
    expect(memberships).toEqual([]);
    await database.destroy();
  });

  it("marks exactly the planned items as seen by the viewer", async () => {
    const { database, viewerMemberId } = await _seededCatalog();
    const seen = await database
      .selectFrom("item_views")
      .select((builder) => {
        return builder.fn.countAll<number>().as("total");
      })
      .where("member_id", "=", viewerMemberId)
      .executeTakeFirstOrThrow();
    const planned = ARCHIVE_PLAN.items.filter((item) => {
      return item.seenByViewer;
    });
    expect(seen.total).toBe(planned.length);
    await database.destroy();
  });

  it("is idempotent: writing twice leaves one archive", async () => {
    const { database } = await _seededCatalog();
    const uploader = await database
      .selectFrom("members")
      .select("id")
      .where("email", "=", "uploader@example.com")
      .executeTakeFirstOrThrow();
    const viewer = await database
      .selectFrom("members")
      .select("id")
      .where("email", "=", "viewer@example.com")
      .executeTakeFirstOrThrow();
    await writeArchivePlan({
      database,
      plan: ARCHIVE_PLAN,
      uploaderMemberId: uploader.id,
      viewerMemberId: viewer.id,
    });
    const count = await database
      .selectFrom("items")
      .select((builder) => {
        return builder.fn.countAll<number>().as("total");
      })
      .executeTakeFirstOrThrow();
    expect(count.total).toBe(ARCHIVE_PLAN.items.length);
    // The session the items hang off is part of "one archive". Counting only
    // `items` is what let a second session, and a third, accumulate unseen.
    const sessions = await database
      .selectFrom("upload_sessions")
      .select((builder) => {
        return builder.fn.countAll<number>().as("total");
      })
      .executeTakeFirstOrThrow();
    expect(sessions.total).toBe(1);
    await database.destroy();
  });

  it("keeps the person nobody photographed, with no item_people rows", async () => {
    const { database } = await _seededCatalog();
    const sofia = await database
      .selectFrom("people")
      .select("id")
      .where("display_name", "=", "Sofía")
      .executeTakeFirstOrThrow();
    const tagged = await database
      .selectFrom("item_people")
      .select("id")
      .where("person_id", "=", sofia.id)
      .execute();
    expect(tagged).toEqual([]);
    await database.destroy();
  });
});
