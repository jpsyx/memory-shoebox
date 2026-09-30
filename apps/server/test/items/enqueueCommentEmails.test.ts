import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { enqueueCommentEmails } from "../../src/items/enqueueCommentEmails.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeViewer = (memberId: string): Viewer => {
  return {
    memberId,
    sessionId: "session",
    role: "uploader",
    isAdmin: false,
    visibleRuleIds: ["visibility-rule-everyone"],
  };
};

const insertComment = async (
  database: Kysely<Database>,
  options: { itemId: string; authorMemberId: string },
): Promise<string> => {
  const id = createId();
  await database
    .insertInto("comments")
    .values({
      id,
      item_id: options.itemId,
      author_member_id: options.authorMemberId,
      body: "Earlier",
      at_seconds: null,
      created_at: NOW,
      edited_at: null,
    })
    .execute();
  return id;
};

const readQueued = async (database: Kysely<Database>) => {
  return database
    .selectFrom("outbound_emails")
    .select([
      "to_member_id",
      "subject",
      "payload_json",
      "idempotency_key",
      "state",
    ])
    .where("kind", "=", "comment")
    .execute();
};

describe("enqueueCommentEmails", () => {
  it("writes one message to the uploader, in the right variant", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database, { display_name: "Papá" });
    const authorId = await insertMember(database, {
      display_name: "Abuela Rosa",
    });
    const itemId = await insertItem(database, { uploadedBy: uploaderId });

    await enqueueCommentEmails({
      transaction: database,
      viewer: makeViewer(authorId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(authorId),
        itemId,
      }),
      commentId: createId(),
      body: "He has your father's chin.",
      atSeconds: null,
      now: NOW,
    });

    const rows = await readQueued(database);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.to_member_id).toBe(uploaderId);
    expect(rows[0]?.subject).toBe("Abuela Rosa wrote on one of your photos");
    expect(JSON.parse(rows[0]?.payload_json ?? "{}").relation).toBe("uploader");
    await database.destroy();
  });

  it("writes one message each to prior commenters, and never to the author", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database);
    const priorId = await insertMember(database, {
      display_name: "Tía Marisol",
    });
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertComment(database, { itemId, authorMemberId: priorId });
    await insertComment(database, { itemId, authorMemberId: authorId });

    await enqueueCommentEmails({
      transaction: database,
      viewer: makeViewer(authorId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(authorId),
        itemId,
      }),
      commentId: createId(),
      body: "The chin is from OUR side.",
      atSeconds: null,
      now: NOW,
    });

    const rows = await readQueued(database);
    expect(rows).toHaveLength(2);
    expect(
      rows
        .map((row) => {
          return row.to_member_id;
        })
        .sort(),
    ).toEqual([uploaderId, priorId].sort());
    await database.destroy();
  });

  it("sends the uploader who also commented exactly one message", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database);
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertComment(database, { itemId, authorMemberId: uploaderId });

    await enqueueCommentEmails({
      transaction: database,
      viewer: makeViewer(authorId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(authorId),
        itemId,
      }),
      commentId: createId(),
      body: "Hello",
      atSeconds: null,
      now: NOW,
    });

    const rows = await readQueued(database);
    expect(rows).toHaveLength(1);
    // The strongest relationship wins, uploader first.
    expect(JSON.parse(rows[0]?.payload_json ?? "{}").relation).toBe("uploader");
    await database.destroy();
  });

  it("respects each recipient's own switch", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database, { notify_on_comment: 0 });
    const priorId = await insertMember(database, { notify_on_reply: 0 });
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertComment(database, { itemId, authorMemberId: priorId });

    await enqueueCommentEmails({
      transaction: database,
      viewer: makeViewer(authorId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(authorId),
        itemId,
      }),
      commentId: createId(),
      body: "Nobody wants to hear it",
      atSeconds: null,
      now: NOW,
    });

    expect(await readQueued(database)).toEqual([]);
    await database.destroy();
  });

  it("does not tell somebody who has lost access that there is new conversation", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database);
    const priorId = await insertMember(database);
    const authorId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: restrictedRuleId,
      memberId: authorId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: restrictedRuleId,
    });
    await insertComment(database, { itemId, authorMemberId: priorId });

    await enqueueCommentEmails({
      transaction: database,
      viewer: { ...makeViewer(authorId), visibleRuleIds: [restrictedRuleId] },
      item: await getVisibleItemOr404({
        database,
        viewer: { ...makeViewer(authorId), visibleRuleIds: [restrictedRuleId] },
        itemId,
      }),
      commentId: createId(),
      body: "Private",
      atSeconds: null,
      now: NOW,
    });

    const rows = await readQueued(database);
    // The uploader always sees their own; the prior commenter no longer can.
    expect(
      rows.map((row) => {
        return row.to_member_id;
      }),
    ).toEqual([uploaderId]);
    await database.destroy();
  });

  it("keys on the comment and the recipient, so a retry sends nothing twice", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const uploaderId = await insertMember(database);
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    const commentId = createId();
    const enqueue = async () => {
      await enqueueCommentEmails({
        transaction: database,
        viewer: makeViewer(authorId),
        item: await getVisibleItemOr404({
          database,
          viewer: makeViewer(authorId),
          itemId,
        }),
        commentId,
        body: "Once",
        atSeconds: null,
        now: NOW,
      });
    };

    await enqueue();
    await enqueue();

    const rows = await readQueued(database);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idempotency_key).toBe(`comment:${commentId}:${uploaderId}`);
    await database.destroy();
  });
});
