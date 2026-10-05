import { afterEach, describe, expect, it } from "vitest";
import { presenceResponseSchema } from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { createId } from "../../src/db/createId.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";

let testApp: TestApp;
let itemSequence = 0;
afterEach(async () => {
  await testApp?.close();
});

async function _createApp(isAdmin = true): Promise<string> {
  const memberId = createId();
  testApp = await createTestApp({
    authenticate: async () => {
      return makeViewer({ memberId, isAdmin });
    },
    clock: () => {
      return new Date("2026-03-10T12:00:00.000Z");
    },
  });
  await insertMember(testApp.database, {
    id: memberId,
    role: isAdmin ? "admin" : "viewer",
    display_name: "Quiet",
  });
  return memberId;
}

async function _insertView(options: {
  memberId: string;
  firstSeen: string;
  firstOpened?: string;
  lastOpened?: string;
}): Promise<void> {
  const itemId = await insertItem(testApp.database, {
    uploadedBy: options.memberId,
    seq: itemSequence++,
  });
  await testApp.database
    .insertInto("item_views")
    .values({
      id: createId(),
      member_id: options.memberId,
      item_id: itemId,
      first_seen_at: options.firstSeen,
      first_opened_at: options.firstOpened ?? null,
      last_opened_at: options.lastOpened ?? null,
      open_count: options.firstOpened === undefined ? 0 : 3,
    })
    .execute();
}

describe("presence", () => {
  it("allows only self or admin and omits removed members", async () => {
    const memberId = await _createApp(false);
    const otherId = await insertMember(testApp.database);
    const own = await testApp.app.inject({ url: "/api/presence" });
    expect(own.statusCode).toBe(200);
    expect(
      presenceResponseSchema.parse(own.json()).presence.map((row) => {
        return row.member.memberId;
      }),
    ).toEqual([memberId]);
    expect(
      (await testApp.app.inject({ url: `/api/presence?memberId=${memberId}` }))
        .statusCode,
    ).toBe(200);
    expect(
      (await testApp.app.inject({ url: `/api/presence?memberId=${otherId}` }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await testApp.app.inject({
          url: `/api/presence?memberId=${createId()}`,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("unions durable local days across all sources, honors 90 days and DST, and counts live history", async () => {
    await _createApp();
    await insertInstanceSetting(testApp.database, {
      key: "shoebox.timezone",
      value: "America/New_York",
    });
    const memberId = await insertMember(testApp.database, {
      display_name: "Present",
    });
    await insertMember(testApp.database, {
      status: "removed",
      removed_at: "2026-03-01T00:00:00.000Z",
    });
    await _insertView({ memberId, firstSeen: "2025-12-11T04:59:59.000Z" });
    await _insertView({ memberId, firstSeen: "2025-12-11T05:00:00.000Z" });
    await _insertView({
      memberId,
      firstSeen: "2026-03-08T04:59:59.000Z",
      firstOpened: "2026-03-08T05:00:00.000Z",
      lastOpened: "2026-03-09T03:59:59.000Z",
    });
    const itemId = await insertItem(testApp.database, {
      uploadedBy: memberId,
      seq: itemSequence++,
    });
    const commentId = await insertComment(testApp.database, {
      itemId,
      authorMemberId: memberId,
      created_at: "2026-03-09T04:00:00.000Z",
    });
    await testApp.database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: "2026-03-09T05:00:00.000Z",
      })
      .execute();
    await testApp.database
      .insertInto("comment_reactions")
      .values({
        id: createId(),
        comment_id: commentId,
        member_id: memberId,
        kind: "love",
        created_at: "2026-03-10T04:00:00.000Z",
      })
      .execute();
    const before = await testApp.database
      .selectFrom("item_views")
      .selectAll()
      .execute();
    const response = await testApp.app.inject({ url: "/api/presence" });
    expect(response.statusCode).toBe(200);
    const rows = presenceResponseSchema.parse(response.json()).presence;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      member: { memberId },
      activeDaysCount: 5,
      activeDaysWindowDays: 90,
      itemsOpenedCount: 1,
      commentsWrittenCount: 1,
      reactionsLeftCount: 2,
    });
    expect(rows[1]).toMatchObject({
      activeDaysCount: 0,
      itemsOpenedCount: 0,
      commentsWrittenCount: 0,
      reactionsLeftCount: 0,
    });
    expect(
      await testApp.database.selectFrom("item_views").selectAll().execute(),
    ).toEqual(before);
    await testApp.database
      .deleteFrom("items")
      .where("id", "=", itemId)
      .execute();
    expect(
      (await testApp.app.inject({ url: "/api/presence" })).json().presence[0],
    ).toMatchObject({ commentsWrittenCount: 0, reactionsLeftCount: 0 });
  });

  it("unions both occurrences of a fall-back hour and waits for local midnight", async () => {
    const memberId = await _createApp();
    testApp.app.clock = () => {
      return new Date("2026-11-02T12:00:00.000Z");
    };
    await insertInstanceSetting(testApp.database, {
      key: "shoebox.timezone",
      value: "America/New_York",
    });
    await _insertView({
      memberId,
      firstSeen: "2026-11-01T04:30:00.000Z",
      firstOpened: "2026-11-01T05:30:00.000Z",
      lastOpened: "2026-11-01T06:30:00.000Z",
    });
    const itemId = await insertItem(testApp.database, {
      uploadedBy: memberId,
      seq: itemSequence++,
    });
    await insertComment(testApp.database, {
      itemId,
      authorMemberId: memberId,
      created_at: "2026-11-02T04:59:59.000Z",
    });
    const beforeMidnight = await testApp.app.inject({ url: "/api/presence" });
    expect(beforeMidnight.statusCode).toBe(200);
    expect(beforeMidnight.json().presence[0].activeDaysCount).toBe(1);
    await testApp.database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: memberId,
        kind: "love",
        created_at: "2026-11-02T05:00:00.000Z",
      })
      .execute();
    const afterMidnight = await testApp.app.inject({ url: "/api/presence" });
    expect(afterMidnight.json().presence[0].activeDaysCount).toBe(2);
  });

  it("keeps self history after access loss and counts first/last opens on distinct days", async () => {
    const memberId = await _createApp(false);
    const uploaderId = await insertMember(testApp.database);
    const ruleId = await testApp.database
      .selectFrom("visibility_rules")
      .select("id")
      .where("mode", "=", "everyone")
      .executeTakeFirstOrThrow();
    const itemId = await insertItem(testApp.database, {
      uploadedBy: uploaderId,
      seq: itemSequence++,
      visibility_rule_id: ruleId.id,
    });
    await testApp.database
      .updateTable("visibility_rules")
      .set({ mode: "only" })
      .where("id", "=", ruleId.id)
      .execute();
    await insertInstanceSetting(testApp.database, {
      key: "shoebox.timezone",
      value: "UTC",
    });
    await testApp.database
      .insertInto("item_views")
      .values({
        id: createId(),
        member_id: memberId,
        item_id: itemId,
        first_seen_at: "2026-01-01T12:00:00.000Z",
        first_opened_at: "2026-01-02T12:00:00.000Z",
        last_opened_at: "2026-01-03T12:00:00.000Z",
        open_count: 20,
      })
      .execute();
    const response = await testApp.app.inject({ url: "/api/presence" });
    expect(response.statusCode).toBe(200);
    expect(response.json().presence[0]).toMatchObject({
      activeDaysCount: 3,
      itemsOpenedCount: 1,
    });
    await testApp.database
      .deleteFrom("items")
      .where("id", "=", itemId)
      .execute();
    const afterDeletion = await testApp.app.inject({ url: "/api/presence" });
    expect(afterDeletion.json().presence[0]).toMatchObject({
      activeDaysCount: 0,
      itemsOpenedCount: 0,
    });
  });

  it("sorts ties by opened items, comments, sign-in date and name, with nulls last", async () => {
    await _createApp();
    await insertInstanceSetting(testApp.database, {
      key: "shoebox.timezone",
      value: "UTC",
    });
    const ids = await Promise.all(
      ["Two opens", "Comments", "Alpha", "Beta", "Older", "Never arrived"].map(
        (display_name) => {
          return insertMember(testApp.database, {
            display_name,
            last_signed_in_at:
              display_name === "Older"
                ? "2026-01-01T00:00:00.000Z"
                : display_name === "Never arrived"
                  ? null
                  : "2026-02-01T00:00:00.000Z",
          });
        },
      ),
    );
    await Promise.all(
      ids.map((memberId) => {
        return _insertView({
          memberId,
          firstSeen: "2026-03-01T00:00:00.000Z",
          firstOpened: "2026-03-01T00:00:00.000Z",
          lastOpened: "2026-03-01T00:00:00.000Z",
        });
      }),
    );
    await _insertView({
      memberId: ids[0]!,
      firstSeen: "2026-03-01T00:00:00.000Z",
      firstOpened: "2026-03-01T00:00:00.000Z",
    });
    const itemId = await insertItem(testApp.database, {
      uploadedBy: ids[1]!,
      seq: itemSequence++,
    });
    await insertComment(testApp.database, {
      itemId,
      authorMemberId: ids[1]!,
      created_at: "2026-03-01T00:00:00.000Z",
    });
    const response = await testApp.app.inject({ url: "/api/presence" });
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .presence.slice(0, 6)
        .map((row: { member: { memberId: string } }) => {
          return row.member.memberId;
        }),
    ).toEqual(ids);
  });

  it("returns missing-member 404 to admins and rejects extra query fields", async () => {
    await _createApp();
    expect(
      (
        await testApp.app.inject({
          url: `/api/presence?memberId=${createId()}`,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await testApp.app.inject({ url: "/api/presence?limit=2" })).statusCode,
    ).toBe(400);
  });

  it("returns an empty presence for an existing removed identity rather than missing-member", async () => {
    await _createApp();
    const removedId = await insertMember(testApp.database, {
      status: "removed",
    });
    const response = await testApp.app.inject({
      url: `/api/presence?memberId=${removedId}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ presence: [], nextCursor: null });
  });

  it("keeps query cost constant as membership grows", async () => {
    await _createApp();
    const counted = makeQueryCountingDatabaseFromDatabase(testApp.database);
    testApp.app.database = counted.database;
    await testApp.app.inject({ url: "/api/presence" });
    const smallCount = counted.getQueryCount();
    await Promise.all(
      Array.from({ length: 25 }, () => {
        return insertMember(testApp.database);
      }),
    );
    counted.reset();
    const response = await testApp.app.inject({ url: "/api/presence" });
    expect(response.statusCode).toBe(200);
    expect(response.json().presence).toHaveLength(26);
    expect(counted.getQueryCount()).toBe(smallCount);
    expect(smallCount).toBe(4);
  });
});
