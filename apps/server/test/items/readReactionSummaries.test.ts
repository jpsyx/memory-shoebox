import { describe, expect, it } from "vitest";
import type { MemberRef } from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  makeReactionSummariesFromRows,
  readCommentReactionRows,
  readItemReactionRows,
} from "../../src/items/readReactionSummaries.ts";
import {
  insertItem,
  insertMember,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const MEMBERS = new Map<string, MemberRef>([
  ["member-rosa", { memberId: "member-rosa", displayName: "Abuela Rosa" }],
  ["member-papa", { memberId: "member-papa", displayName: "Papá" }],
  ["member-mama", { memberId: "member-mama", displayName: "Mamá" }],
]);

describe("makeReactionSummariesFromRows", () => {
  it("orders kinds by count, then by the canonical order", () => {
    const summaries = makeReactionSummariesFromRows({
      rows: [
        {
          targetId: "item",
          memberId: "member-rosa",
          kind: "care",
          createdAt: "2026-09-27T10:00:00.000Z",
        },
        {
          targetId: "item",
          memberId: "member-papa",
          kind: "love",
          createdAt: "2026-09-27T10:00:01.000Z",
        },
        {
          targetId: "item",
          memberId: "member-mama",
          kind: "love",
          createdAt: "2026-09-27T10:00:02.000Z",
        },
      ],
      members: MEMBERS,
      viewerMemberId: "member-papa",
    });

    expect(
      summaries.get("item")?.kinds.map((entry) => {
        return [entry.kind, entry.count];
      }),
    ).toEqual([
      ["love", 2],
      ["care", 1],
    ]);
  });

  it("breaks a tie on the canonical order, not on insertion", () => {
    const summaries = makeReactionSummariesFromRows({
      rows: [
        {
          targetId: "item",
          memberId: "member-rosa",
          kind: "care",
          createdAt: "2026-09-27T10:00:00.000Z",
        },
        {
          targetId: "item",
          memberId: "member-papa",
          kind: "love",
          createdAt: "2026-09-27T10:00:01.000Z",
        },
      ],
      members: MEMBERS,
      viewerMemberId: "member-papa",
    });

    expect(summaries.get("item")?.kinds[0]?.kind).toBe("love");
  });

  it("orders members inside a kind by when they first said it", () => {
    const summaries = makeReactionSummariesFromRows({
      rows: [
        {
          targetId: "item",
          memberId: "member-mama",
          kind: "love",
          createdAt: "2026-09-27T10:00:05.000Z",
        },
        {
          targetId: "item",
          memberId: "member-rosa",
          kind: "love",
          createdAt: "2026-09-27T10:00:01.000Z",
        },
      ],
      members: MEMBERS,
      viewerMemberId: "member-papa",
    });

    expect(
      summaries.get("item")?.kinds[0]?.members.map((member) => {
        return member.displayName;
      }),
    ).toEqual(["Abuela Rosa", "Mamá"]);
  });

  it("reports the viewer's own kind, and null when they left none", () => {
    const rows = [
      {
        targetId: "item",
        memberId: "member-rosa",
        kind: "wow",
        createdAt: "2026-09-27T10:00:00.000Z",
      },
    ];

    expect(
      makeReactionSummariesFromRows({
        rows,
        members: MEMBERS,
        viewerMemberId: "member-rosa",
      }).get("item")?.myKind,
    ).toBe("wow");
    expect(
      makeReactionSummariesFromRows({
        rows,
        members: MEMBERS,
        viewerMemberId: "member-papa",
      }).get("item")?.myKind,
    ).toBeNull();
  });

  it("keeps two targets apart", () => {
    const summaries = makeReactionSummariesFromRows({
      rows: [
        {
          targetId: "comment-a",
          memberId: "member-rosa",
          kind: "like",
          createdAt: "2026-09-27T10:00:00.000Z",
        },
        {
          targetId: "comment-b",
          memberId: "member-papa",
          kind: "haha",
          createdAt: "2026-09-27T10:00:00.000Z",
        },
      ],
      members: MEMBERS,
      viewerMemberId: "member-rosa",
    });

    expect(summaries.get("comment-a")?.kinds[0]?.kind).toBe("like");
    expect(summaries.get("comment-b")?.kinds[0]?.kind).toBe("haha");
  });
});

/**
 * Inserts one comment directly: there is no seed helper for comments, and the
 * plan does not ask for one, so this test builds its own row the way the
 * other integration tests in this repository insert rows outside their own
 * seed helpers.
 */
async function insertComment(
  database: ReturnType<typeof createDatabase>,
  options: { itemId: string; authorMemberId: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("comments")
    .values({
      id,
      item_id: options.itemId,
      author_member_id: options.authorMemberId,
      body: "Qué foto tan bonita",
      at_seconds: null,
      created_at: NOW,
      edited_at: null,
    })
    .execute();
  return id;
}

describe("readItemReactionRows", () => {
  it("reads every reaction on one item", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosa = await insertMember(database);
    const papa = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: rosa });

    await database
      .insertInto("item_reactions")
      .values([
        {
          id: createId(),
          item_id: itemId,
          member_id: rosa,
          kind: "love",
          created_at: NOW,
        },
        {
          id: createId(),
          item_id: itemId,
          member_id: papa,
          kind: "care",
          created_at: NOW,
        },
      ])
      .execute();

    const rows = await readItemReactionRows({ database, itemId });

    expect(rows).toHaveLength(2);
    expect(
      new Set(
        rows.map((row) => {
          return row.memberId;
        }),
      ),
    ).toEqual(new Set([rosa, papa]));
    expect(
      rows.every((row) => {
        return row.targetId === itemId;
      }),
    ).toBe(true);
    await database.destroy();
  });

  it("reads nothing for an item nobody has reacted to", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosa = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: rosa });

    const rows = await readItemReactionRows({ database, itemId });

    expect(rows).toEqual([]);
    await database.destroy();
  });
});

describe("readCommentReactionRows", () => {
  it("reads reactions for several comments in one call", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const rosa = await insertMember(database);
    const papa = await insertMember(database);
    const mama = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: rosa });

    // Sixteen comments would make the point at full scale; three is enough
    // to prove the batch shape, since the query itself is the thing under
    // test, not the row count.
    const commentA = await insertComment(database, {
      itemId,
      authorMemberId: rosa,
    });
    const commentB = await insertComment(database, {
      itemId,
      authorMemberId: papa,
    });
    const commentC = await insertComment(database, {
      itemId,
      authorMemberId: mama,
    });

    await database
      .insertInto("comment_reactions")
      .values([
        {
          id: createId(),
          comment_id: commentA,
          member_id: papa,
          kind: "like",
          created_at: NOW,
        },
        {
          id: createId(),
          comment_id: commentB,
          member_id: rosa,
          kind: "haha",
          created_at: NOW,
        },
        {
          id: createId(),
          comment_id: commentC,
          member_id: rosa,
          kind: "sad",
          created_at: NOW,
        },
      ])
      .execute();

    // The point of this reader: one call, `commentIds` naming every comment
    // in the thread, must return every comment's rows. A caller that queried
    // once per comment would still pass a test that only checked one id.
    const rows = await readCommentReactionRows({
      database,
      commentIds: [commentA, commentB, commentC],
    });

    expect(rows).toHaveLength(3);
    expect(
      new Set(
        rows.map((row) => {
          return row.targetId;
        }),
      ),
    ).toEqual(new Set([commentA, commentB, commentC]));
    await database.destroy();
  });

  it("makes no query and returns nothing for an empty batch", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const rows = await readCommentReactionRows({ database, commentIds: [] });

    expect(rows).toEqual([]);
    await database.destroy();
  });
});
