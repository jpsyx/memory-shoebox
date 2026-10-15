// apps/server/test/writeArchivePlan.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { seedMember } from "../scripts/seedMember.ts";
import { ARCHIVE_PLAN } from "../scripts/archiveSeed/archivePlan.ts";
import { writeArchivePlan } from "../scripts/archiveSeed/writeArchivePlan/writeArchivePlan.ts";
import { insertComment } from "./helpers/seedHelpers/itemSeedHelpers.ts";
import { insertSession } from "./helpers/seedHelpers/memberSeedHelpers.ts";
import {
  insertOutboundEmail,
  insertRemovalRequest,
} from "./helpers/seedHelpers/miscSeedHelpers.ts";
import { NOW } from "./helpers/seedHelpers/seedTime.ts";

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
  return {
    database,
    written,
    uploaderMemberId: uploader.memberId,
    viewerMemberId: viewer.memberId,
  };
}

async function _writePriorArchiveHistory(
  catalog: Awaited<ReturnType<typeof _seededCatalog>>,
): Promise<void> {
  const { database, uploaderMemberId, viewerMemberId } = catalog;
  const item = await database
    .selectFrom("items")
    .select("id")
    .executeTakeFirstOrThrow();
  const requestId = await insertRemovalRequest(database, {
    requestedByMemberId: viewerMemberId,
    itemUploaderMemberId: uploaderMemberId,
    item_id: item.id,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  await insertRemovalRequest(database, {
    requestedByMemberId: viewerMemberId,
    itemUploaderMemberId: uploaderMemberId,
  });
  const commentId = await _writePriorConversation(catalog, item.id);
  await insertSession(database, { memberId: viewerMemberId });
  await insertOutboundEmail(database, {
    kind: "removal_request",
    trigger_kind: "removal_request",
    trigger_id: requestId,
    payload_json: JSON.stringify({ frozen: "Original request history" }),
  });
  await insertOutboundEmail(database, {
    kind: "comment",
    trigger_kind: "comment",
    trigger_id: commentId,
    payload_json: JSON.stringify({ frozen: "Original comment history" }),
  });
}

async function _writePriorConversation(
  catalog: Awaited<ReturnType<typeof _seededCatalog>>,
  itemId: string,
): Promise<string> {
  const { database, uploaderMemberId, viewerMemberId } = catalog;
  const commentId = await insertComment(database, {
    itemId,
    authorMemberId: viewerMemberId,
  });
  await database
    .insertInto("comment_reactions")
    .values({
      id: "old-comment-reaction",
      comment_id: commentId,
      member_id: uploaderMemberId,
      kind: "love",
      created_at: NOW,
    })
    .execute();
  await database
    .insertInto("item_reactions")
    .values({
      id: "old-item-reaction",
      item_id: itemId,
      member_id: uploaderMemberId,
      kind: "like",
      created_at: NOW,
    })
    .execute();
  return commentId;
}

async function _getPreservedRows(
  catalog: Awaited<ReturnType<typeof _seededCatalog>>,
) {
  const { database } = catalog;
  return {
    members: await database
      .selectFrom("members")
      .selectAll()
      .orderBy("id")
      .execute(),
    sessions: await database
      .selectFrom("sessions")
      .selectAll()
      .orderBy("id")
      .execute(),
    mail: await database
      .selectFrom("outbound_emails")
      .selectAll()
      .orderBy("id")
      .execute(),
  };
}

async function _expectNoPriorConversation(
  database: Awaited<ReturnType<typeof _seededCatalog>>["database"],
): Promise<void> {
  expect(
    await database.selectFrom("removal_requests").selectAll().execute(),
  ).toEqual([]);
  expect(await database.selectFrom("comments").selectAll().execute()).toEqual(
    [],
  );
  expect(
    await database.selectFrom("comment_reactions").selectAll().execute(),
  ).toEqual([]);
  expect(
    await database.selectFrom("item_reactions").selectAll().execute(),
  ).toEqual([]);
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

  it("replaces archive request history while preserving identity and frozen mail", async () => {
    const catalog = await _seededCatalog();
    const { database, uploaderMemberId, viewerMemberId } = catalog;
    try {
      await _writePriorArchiveHistory(catalog);
      const before = await _getPreservedRows(catalog);
      expect(
        await database
          .selectFrom("removal_requests")
          .select("state")
          .orderBy("state")
          .execute(),
      ).toEqual([{ state: "declined" }, { state: "open" }]);
      await writeArchivePlan({
        database,
        plan: ARCHIVE_PLAN,
        uploaderMemberId,
        viewerMemberId,
      });
      await _expectNoPriorConversation(database);
      expect(await _getPreservedRows(catalog)).toEqual(before);
      expect(
        await database.selectFrom("items").select("id").execute(),
      ).toHaveLength(ARCHIVE_PLAN.items.length);
      expect(
        await database.selectFrom("upload_sessions").select("id").execute(),
      ).toHaveLength(1);
    } finally {
      await database.destroy();
    }
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
