import { describe, expect, it } from "vitest";
import { reactionSummarySchema } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("PUT and DELETE /api/items/:itemId/reaction", () => {
  it("sets one, changes it in place, and keeps the first moment", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const url = `/api/items/${itemId}/reaction`;

    const first = await app.inject({
      method: "PUT",
      url,
      headers: { cookie },
      payload: { kind: "love" },
    });
    const changed = await app.inject({
      method: "PUT",
      url,
      headers: { cookie },
      payload: { kind: "care" },
    });

    expect(first.statusCode).toBe(200);
    expect(reactionSummarySchema.parse(first.json()).myKind).toBe("love");
    expect(changed.json().myKind).toBe("care");
    // One row, because the unique constraint is the whole of the rule.
    const rows = await database
      .selectFrom("item_reactions")
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.created_at).toBe(NOW);
    await close();
  });

  it("returns the names, ordered by count and then by the canonical order", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherId = await insertMember(database, { display_name: "Mamá" });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: otherId,
        kind: "care",
        created_at: NOW,
      })
      .execute();

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/reaction`,
      headers: { cookie },
      payload: { kind: "love" },
    });

    const summary = reactionSummarySchema.parse(response.json());
    expect(
      summary.kinds.map((entry) => {
        return entry.kind;
      }),
    ).toEqual(["love", "care"]);
    expect(summary.kinds[1]?.members[0]?.displayName).toBe("Mamá");
    await close();
  });

  it("unreacts with a 204, and unreacting twice is still a 204", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const url = `/api/items/${itemId}/reaction`;
    await app.inject({
      method: "PUT",
      url,
      headers: { cookie },
      payload: { kind: "wow" },
    });

    const first = await app.inject({
      method: "DELETE",
      url,
      headers: { cookie },
    });
    const again = await app.inject({
      method: "DELETE",
      url,
      headers: { cookie },
    });

    expect(first.statusCode).toBe(204);
    expect(again.statusCode).toBe(204);
    expect(
      await database.selectFrom("item_reactions").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("refuses a kind outside the six", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/reaction`,
      headers: { cookie },
      payload: { kind: "angry" },
    });

    expect(response.statusCode).toBe(400);
    await close();
  });

  it("is a 404 on an invisible item, byte-identical to a bad id", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      visibility_rule_id: hiddenRuleId,
    });

    const hidden = await app.inject({
      method: "PUT",
      url: `/api/items/${hiddenId}/reaction`,
      headers: { cookie },
      payload: { kind: "love" },
    });
    const nothing = await app.inject({
      method: "PUT",
      url: `/api/items/${createId()}/reaction`,
      headers: { cookie },
      payload: { kind: "love" },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    await close();
  });
});

describe("PUT and DELETE /api/comments/:commentId/reaction", () => {
  it("reacts to a comment and takes it back", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const commentId = createId();
    await database
      .insertInto("comments")
      .values({
        id: commentId,
        item_id: itemId,
        author_member_id: memberId,
        body: "Ay, mi amor.",
        at_seconds: null,
        created_at: NOW,
        edited_at: null,
      })
      .execute();
    const url = `/api/comments/${commentId}/reaction`;

    const set = await app.inject({
      method: "PUT",
      url,
      headers: { cookie },
      payload: { kind: "haha" },
    });
    const cleared = await app.inject({
      method: "DELETE",
      url,
      headers: { cookie },
    });

    expect(set.statusCode).toBe(200);
    expect(set.json().myKind).toBe("haha");
    expect(cleared.statusCode).toBe(204);
    await close();
  });

  it("is a 404 naming the comment when its item is invisible", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      visibility_rule_id: hiddenRuleId,
    });
    const commentId = createId();
    await database
      .insertInto("comments")
      .values({
        id: commentId,
        item_id: itemId,
        author_member_id: otherMemberId,
        body: "Private",
        at_seconds: null,
        created_at: NOW,
        edited_at: null,
      })
      .execute();

    const response = await app.inject({
      method: "PUT",
      url: `/api/comments/${commentId}/reaction`,
      headers: { cookie },
      payload: { kind: "love" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("comment_not_found");
    await close();
  });
});
