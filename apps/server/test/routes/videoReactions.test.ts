import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  videoReactionSchema,
  videoReactionsSchema,
} from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import {
  insertSignedInMember,
  type SignedInMember,
} from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

let context: TestApp;
let author: SignedInMember;
let itemId: string;
let currentTime = NOW;

beforeEach(async () => {
  currentTime = NOW;
  context = await createTestApp({
    clock: () => {
      return new Date(currentTime);
    },
  });
  author = await insertSignedInMember({
    database: context.database,
    member: { role: "viewer" },
  });
  itemId = await insertItem(context.database, {
    uploadedBy: await insertMember(context.database),
    kind: "video",
    duration_ms: 30_000,
  });
});

afterEach(async () => {
  await context.close();
});

function _putReaction(
  options: {
    reactionId?: string;
    cookie?: string;
    targetId?: string;
    payload?: object;
  } = {},
) {
  return context.app.inject({
    method: "PUT",
    url: `/api/items/${options.targetId ?? itemId}/video-reactions/${options.reactionId ?? createId()}`,
    headers: { cookie: options.cookie ?? author.cookie },
    payload: options.payload ?? { emoji: "😂", atSeconds: 12.5 },
  });
}

describe("video reaction events", () => {
  it("keeps multiple gestures by one viewer and never queues reaction mail", async () => {
    const first = await _putReaction();
    const second = await _putReaction({
      payload: { emoji: "😂", atSeconds: 20 },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const event = videoReactionSchema.parse(first.json());
    expect(event).toMatchObject({
      author: { memberId: author.memberId },
      emoji: "😂",
      atSeconds: 12.5,
      canDelete: true,
      createdAt: NOW,
    });
    expect(second.json().reactionId).not.toBe(event.reactionId);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(2);
    expect(
      await context.database.selectFrom("item_reactions").selectAll().execute(),
    ).toEqual([]);
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("returns the original event on an identical retry without changing its timestamp", async () => {
    const reactionId = createId();
    const first = await _putReaction({ reactionId });
    currentTime = "2026-09-27T10:00:10.000Z";
    const retry = await _putReaction({ reactionId });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.body).toBe(first.body);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("serializes simultaneous retries of one client event", async () => {
    const reactionId = createId();
    const responses = await Promise.all([
      _putReaction({ reactionId }),
      _putReaction({ reactionId }),
    ]);
    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200]);
    expect(responses[0]?.body).toBe(responses[1]?.body);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("matches retries by their clamped moment rather than their raw offset", async () => {
    const reactionId = createId();
    const first = await _putReaction({
      reactionId,
      payload: { emoji: "😂", atSeconds: 30.0001 },
    });
    const retry = await _putReaction({
      reactionId,
      payload: { emoji: "😂", atSeconds: 31 },
    });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().atSeconds).toBe(30);
    expect(retry.body).toBe(first.body);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("rejects a nonfinite JSON number at the route boundary", async () => {
    const response = await context.app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/video-reactions/${createId()}`,
      headers: { cookie: author.cookie, "content-type": "application/json" },
      payload: '{"emoji":"😂","atSeconds":1e999}',
    });
    expect(response.statusCode).toBe(400);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("shares the conversation write budget across PUT and DELETE", async () => {
    const reactionId = createId();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await _putReaction({ reactionId })).statusCode).toBe(200);
    }
    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}/video-reactions/${reactionId}`,
      headers: { cookie: author.cookie },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe("rate_limited");
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("rejects an existing ID reused with a changed emoji, moment, item, or member", async () => {
    const reactionId = createId();
    expect((await _putReaction({ reactionId })).statusCode).toBe(200);
    const other = await insertSignedInMember({
      database: context.database,
      token: "other-video-reactor",
    });
    const otherItemId = await insertItem(context.database, {
      seq: 2,
      uploadedBy: author.memberId,
      kind: "video",
      duration_ms: 30_000,
    });
    const changes = [
      { payload: { emoji: "😍", atSeconds: 12.5 } },
      { payload: { emoji: "😂", atSeconds: 13 } },
      { targetId: otherItemId },
      { cookie: other.cookie },
    ];
    for (const change of changes) {
      const response = await _putReaction({ reactionId, ...change });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("video_reaction_conflict");
    }
    expect(
      await context.database
        .selectFrom("video_reactions")
        .select(["member_id", "item_id", "emoji", "at_seconds"])
        .execute(),
    ).toEqual([
      {
        member_id: author.memberId,
        item_id: itemId,
        emoji: "😂",
        at_seconds: 12.5,
      },
    ]);
  });

  it("clamps a finite moment beyond duration and accepts the zero boundary", async () => {
    const past = await _putReaction({
      payload: { emoji: "❤️", atSeconds: 30.0001 },
    });
    const start = await _putReaction({
      payload: { emoji: "👏", atSeconds: 0 },
    });
    expect(past.statusCode).toBe(200);
    expect(past.json().atSeconds).toBe(30);
    expect(start.json().atSeconds).toBe(0);
  });

  it.each([
    { emoji: "😂", atSeconds: -1 },
    { emoji: "😂", atSeconds: null },
    { emoji: "😂", atSeconds: "Infinity" },
    { emoji: "angry", atSeconds: 1 },
  ])("rejects invalid moments or emoji: %j", async (payload) => {
    expect((await _putReaction({ payload })).statusCode).toBe(400);
  });

  it.each([
    { kind: "photo", duration_ms: null },
    { kind: "video", duration_ms: null },
  ])("rejects gestures without a known video duration: %j", async (columns) => {
    const targetId = await insertItem(context.database, {
      seq: 2,
      uploadedBy: author.memberId,
      ...columns,
    });
    expect((await _putReaction({ targetId })).statusCode).toBe(400);
  });

  it.each(["GET", "PUT", "DELETE"] as const)(
    "checks visibility before %s and makes hidden and missing IDs indistinguishable",
    async (method) => {
      const visibilityRuleId = await insertVisibilityRule(context.database, {
        mode: "only",
      });
      const hiddenId = await insertItem(context.database, {
        seq: 2,
        uploadedBy: await insertMember(context.database),
        visibility_rule_id: visibilityRuleId,
        kind: "video",
        duration_ms: 30_000,
      });
      const reactionId = createId();
      const request = (targetId: string) => {
        return context.app.inject({
          method,
          url: `/api/items/${targetId}/video-reactions${method === "GET" ? "" : `/${reactionId}`}`,
          headers: { cookie: author.cookie },
          ...(method === "PUT"
            ? { payload: { emoji: "😂", atSeconds: 3 } }
            : {}),
        });
      };
      const hidden = await request(hiddenId);
      const missing = await request(createId());
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json().error).toBe("item_not_found");
      expect(hidden.body).toBe(missing.body);
    },
  );

  it("allows author and admin deletion, refuses other members, and makes removal idempotent", async () => {
    const reactionId = createId();
    expect((await _putReaction({ reactionId })).statusCode).toBe(200);
    const other = await insertSignedInMember({
      database: context.database,
      token: "other-deleter",
    });
    const admin = await insertSignedInMember({
      database: context.database,
      token: "admin-deleter",
      member: { role: "admin" },
    });
    const remove = (cookie: string, targetId = reactionId) => {
      return context.app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}/video-reactions/${targetId}`,
        headers: { cookie },
      });
    };
    expect((await remove(other.cookie)).statusCode).toBe(403);
    expect((await remove(admin.cookie)).statusCode).toBe(204);
    expect((await remove(admin.cookie)).statusCode).toBe(204);
    const ownId = createId();
    await _putReaction({ reactionId: ownId });
    expect((await remove(author.cookie, ownId)).statusCode).toBe(204);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("does not delete an event by addressing its ID through another visible item", async () => {
    const reactionId = createId();
    await _putReaction({ reactionId });
    const otherItemId = await insertItem(context.database, {
      seq: 2,
      uploadedBy: author.memberId,
      kind: "video",
      duration_ms: 30_000,
    });
    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/items/${otherItemId}/video-reactions/${reactionId}`,
      headers: { cookie: author.cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(
      await context.database
        .selectFrom("video_reactions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("returns only the newest fifty events, with stable ID ordering and per-viewer permissions", async () => {
    const otherMemberId = await insertMember(context.database);
    await context.database
      .insertInto("video_reactions")
      .values(
        Array.from({ length: 55 }, (_, index) => {
          return {
            id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            item_id: itemId,
            member_id: index === 54 ? author.memberId : otherMemberId,
            emoji: "😂",
            at_seconds: 1,
            created_at: index < 5 ? "2026-01-01T00:00:00.000Z" : NOW,
          };
        }),
      )
      .execute();
    const response = await context.app.inject({
      method: "GET",
      url: `/api/items/${itemId}/video-reactions`,
      headers: { cookie: author.cookie },
    });
    expect(response.statusCode).toBe(200);
    const events = videoReactionsSchema.parse(response.json());
    expect(events).toHaveLength(50);
    expect(events[0]?.reactionId).toBe("00000000-0000-4000-8000-000000000054");
    expect(events[49]?.reactionId).toBe("00000000-0000-4000-8000-000000000005");
    expect(events[0]?.canDelete).toBe(true);
    expect(events[1]?.canDelete).toBe(false);
    const admin = await insertSignedInMember({
      database: context.database,
      token: "admin-reader",
      member: { role: "admin" },
    });
    const adminResponse = await context.app.inject({
      method: "GET",
      url: `/api/items/${itemId}/video-reactions`,
      headers: { cookie: admin.cookie },
    });
    expect(
      videoReactionsSchema.parse(adminResponse.json()).every((event) => {
        return event.canDelete;
      }),
    ).toBe(true);
  });
});
