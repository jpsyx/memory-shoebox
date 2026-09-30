import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readCommentThread } from "../../src/items/readCommentThread.ts";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readCommentThread", () => {
  it("returns the thread oldest first, with the author resolved", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosaId = await insertMember(database, {
      display_name: "Abuela Rosa",
    });
    const papaId = await insertMember(database, { display_name: "Papá" });
    const itemId = await insertItem(database, { uploadedBy: papaId });
    await insertComment(database, {
      itemId,
      authorMemberId: rosaId,
      body: "Second",
      created_at: shiftMinutes({ instant: NOW, minutes: 5 }),
    });
    await insertComment(database, {
      itemId,
      authorMemberId: papaId,
      body: "First",
    });

    const comments = await readCommentThread({
      database,
      itemId,
      viewer: {
        memberId: papaId,
        sessionId: "s",
        role: "uploader",
        isAdmin: false,
        visibleRuleIds: [],
      },
      members: await readMemberRefs(database),
    });

    expect(
      comments.map((comment) => {
        return comment.body;
      }),
    ).toEqual(["First", "Second"]);
    expect(comments[0]?.author.displayName).toBe("Papá");
    await database.destroy();
  });

  it("lets an author edit and delete their own, and an admin delete anybody's", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosaId = await insertMember(database);
    const adminId = await insertMember(database, { role: "admin" });
    const itemId = await insertItem(database, { uploadedBy: rosaId });
    await insertComment(database, { itemId, authorMemberId: rosaId });

    const forAdmin = await readCommentThread({
      database,
      itemId,
      viewer: {
        memberId: adminId,
        sessionId: "s",
        role: "admin",
        isAdmin: true,
        visibleRuleIds: [],
      },
      members: await readMemberRefs(database),
    });

    // Decision 8 grants an admin "delete anything", never edit anything:
    // nobody edits another person's words.
    expect(forAdmin[0]?.canEdit).toBe(false);
    expect(forAdmin[0]?.canDelete).toBe(true);
    await database.destroy();
  });

  it("carries the pin, the edited mark and the reactions", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: 30_000,
    });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
      at_seconds: 12.5,
      edited_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    await database
      .insertInto("comment_reactions")
      .values({
        id: createId(),
        comment_id: commentId,
        member_id: memberId,
        kind: "haha",
        created_at: NOW,
      })
      .execute();

    const [comment] = await readCommentThread({
      database,
      itemId,
      viewer: {
        memberId,
        sessionId: "s",
        role: "uploader",
        isAdmin: false,
        visibleRuleIds: [],
      },
      members: await readMemberRefs(database),
    });

    expect(comment?.atSeconds).toBe(12.5);
    expect(comment?.editedAt).not.toBeNull();
    expect(comment?.reactions.myKind).toBe("haha");
    // The other direction from the admin test above: the author, viewing
    // their own comment, may edit it.
    expect(comment?.canEdit).toBe(true);
    await database.destroy();
  });
});

describe("readCommentThread's query plan", () => {
  it("costs the same for one comment as for twelve", async () => {
    const small = makeQueryCountingDatabaseFromDatabase(
      createDatabase(":memory:"),
    );
    await migrateToLatest(small.database);
    const smallMemberId = await insertMember(small.database);
    const smallItemId = await insertItem(small.database, {
      uploadedBy: smallMemberId,
    });
    await insertComment(small.database, {
      itemId: smallItemId,
      authorMemberId: smallMemberId,
    });
    const smallMembers = await readMemberRefs(small.database);

    small.reset();
    await readCommentThread({
      database: small.database,
      itemId: smallItemId,
      viewer: {
        memberId: smallMemberId,
        sessionId: "s",
        role: "uploader",
        isAdmin: false,
        visibleRuleIds: [],
      },
      members: smallMembers,
    });
    const smallQueries = small.getQueryCount();

    const large = makeQueryCountingDatabaseFromDatabase(
      createDatabase(":memory:"),
    );
    await migrateToLatest(large.database);
    const largeMemberId = await insertMember(large.database);
    const largeItemId = await insertItem(large.database, {
      uploadedBy: largeMemberId,
    });
    await Promise.all(
      Array.from({ length: 12 }, () => {
        return insertComment(large.database, {
          itemId: largeItemId,
          authorMemberId: largeMemberId,
        });
      }),
    );
    const largeMembers = await readMemberRefs(large.database);

    large.reset();
    await readCommentThread({
      database: large.database,
      itemId: largeItemId,
      viewer: {
        memberId: largeMemberId,
        sessionId: "s",
        role: "uploader",
        isAdmin: false,
        visibleRuleIds: [],
      },
      members: largeMembers,
    });
    const largeQueries = large.getQueryCount();

    // The comments, then every reaction on all of them in one
    // `comment_id IN (...)`: two queries whatever the thread's size.
    expect(smallQueries).toBe(2);
    expect(largeQueries).toBe(smallQueries);

    await small.database.destroy();
    await large.database.destroy();
  });
});
