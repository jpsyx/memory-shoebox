import { afterEach, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { dailyDigestEmail } from "@memory-shoebox/emails";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createId } from "../../src/db/createId.ts";
import { runDailyDigests } from "../../src/mail/digests/runDailyDigests.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  insertInstanceSetting,
  insertUploadSession,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

const NOW = "2026-11-03T10:00:00.000Z";
async function _fixture(commentCount = 1) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const authorId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: authorId });
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  await insertInstanceSetting(database, {
    key: "mail.from_address",
    value: "family@shoebox.example",
  });
  const eventIds: string[] = [];
  for (let index = 0; index < commentCount; index += 1) {
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
      body: "💚".repeat(210),
    });
    const id = createId();
    eventIds.push(id);
    await database
      .insertInto("notification_digest_events")
      .values({
        id,
        member_id: memberId,
        category: "comment",
        source_kind: "comment",
        source_id: commentId,
        occurred_at: "2026-11-02T12:00:00.000Z",
        deduplication_key: id,
        state: "pending",
        batch_id: null,
      })
      .execute();
  }
  const sender = {
    send: vi.fn(async () => {
      return { providerMessageId: "fake" };
    }),
  };
  return { database, memberId, authorId, itemId, eventIds, sender };
}
afterEach(() => {
  vi.restoreAllMocks();
});

it("includes overflow in safe totals once and bounds Unicode excerpts", async () => {
  const context = await _fixture(21);
  try {
    await runDailyDigests({ database: context.database, now: NOW });
    const row = await context.database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    const payload = JSON.parse(row.payload_json);
    expect(payload.comments.totalEvents).toBe(21);
    expect(payload.comments.entries).toHaveLength(20);
    expect(Array.from(payload.comments.entries[0].excerpt)).toHaveLength(200);
    expect(
      await context.database
        .selectFrom("notification_digest_events")
        .select("id")
        .where("state", "=", "included")
        .execute(),
    ).toHaveLength(21);
    await runDailyDigests({
      database: context.database,
      now: "2026-11-04T10:00:00.000Z",
    });
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .select("id")
        .execute(),
    ).toHaveLength(1);
  } finally {
    await context.database.destroy();
  }
});

it.each(["off", "removed", "hidden", "deleted"])(
  "cancels a prepared digest when content becomes %s",
  async (reason) => {
    const context = await _fixture();
    try {
      const { database, memberId, itemId } = context;
      await runDailyDigests({ database, now: NOW });
      if (reason === "off") {
        await database
          .updateTable("members")
          .set({ notify_comment_frequency: "off" })
          .where("id", "=", memberId)
          .execute();
      }
      if (reason === "removed") {
        await database
          .updateTable("members")
          .set({ status: "removed" })
          .where("id", "=", memberId)
          .execute();
      }
      if (reason === "deleted") {
        await database.deleteFrom("comments").execute();
      }
      if (reason === "hidden") {
        const ruleId = await insertVisibilityRule(database, { mode: "only" });
        await database
          .updateTable("items")
          .set({ visibility_rule_id: ruleId })
          .where("id", "=", itemId)
          .execute();
      }
      await runMailQueueOnce({ database, sender: context.sender, now: NOW });
      expect(context.sender.send).not.toHaveBeenCalled();
      expect(
        (
          await database
            .selectFrom("outbound_emails")
            .select("state")
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe("cancelled");
    } finally {
      await context.database.destroy();
    }
  },
);

it("keeps already prepared content when the frequency changes to immediate", async () => {
  const context = await _fixture();
  try {
    await runDailyDigests({ database: context.database, now: NOW });
    await context.database
      .updateTable("members")
      .set({ notify_comment_frequency: "immediate" })
      .where("id", "=", context.memberId)
      .execute();
    await runMailQueueOnce({
      database: context.database,
      sender: context.sender,
      now: NOW,
    });
    expect(context.sender.send).toHaveBeenCalledOnce();
  } finally {
    await context.database.destroy();
  }
});

it("rolls back batch reservation, queue row, and event changes on a database failure", async () => {
  const context = await _fixture();
  try {
    await sql`create trigger fail_digest before insert on outbound_emails when new.kind='daily_digest' begin select raise(abort, 'injected failure'); end`.execute(
      context.database,
    );
    await expect(
      runDailyDigests({ database: context.database, now: NOW }),
    ).rejects.toThrow("injected failure");
    expect(
      await context.database
        .selectFrom("notification_digest_batches")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      (
        await context.database
          .selectFrom("notification_digest_events")
          .select("state")
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("pending");
    await sql`drop trigger fail_digest`.execute(context.database);
    await Promise.all([
      runDailyDigests({ database: context.database, now: NOW }),
      runDailyDigests({ database: context.database, now: NOW }),
    ]);
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  } finally {
    await context.database.destroy();
  }
});

it("defers a rendering race without provider intent or consuming an attempt", async () => {
  const context = await _fixture();
  try {
    await runDailyDigests({ database: context.database, now: NOW });
    const render = dailyDigestEmail.render;
    vi.spyOn(dailyDigestEmail, "render").mockImplementationOnce(
      async (payload) => {
        const rendered = await render(payload);
        await context.database.deleteFrom("comments").execute();
        return rendered;
      },
    );
    const result = await runMailQueueOnce({
      database: context.database,
      sender: context.sender,
      now: NOW,
    });
    expect(result.deferredCount).toBe(1);
    expect(context.sender.send).not.toHaveBeenCalled();
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .select(["state", "attempts"])
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: "queued", attempts: 0 });
    expect(
      (
        await context.database
          .selectFrom("notification_digest_batches")
          .select("provider_attempted_at")
          .executeTakeFirstOrThrow()
      ).provider_attempted_at,
    ).toBeNull();
  } finally {
    await context.database.destroy();
  }
});

it("counts only surviving visible upload items and never unrelated sessions", async () => {
  const context = await _fixture(0);
  try {
    const { database, memberId, authorId } = context;
    const sessionId = await insertUploadSession(database, {
      uploadedBy: authorId,
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertItem(database, {
      uploadedBy: authorId,
      seq: 2,
      upload_session_id: sessionId,
    });
    await insertItem(database, {
      uploadedBy: authorId,
      seq: 3,
      upload_session_id: sessionId,
      visibility_rule_id: ruleId,
    });
    await insertItem(database, { uploadedBy: authorId, seq: 4 });
    await database
      .insertInto("notification_digest_events")
      .values({
        id: "upload",
        member_id: memberId,
        category: "upload",
        source_kind: "upload_session",
        source_id: sessionId,
        occurred_at: "2026-11-02T12:00:00.000Z",
        deduplication_key: "upload",
        state: "pending",
        batch_id: null,
      })
      .execute();
    await runDailyDigests({ database, now: NOW });
    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(JSON.parse(row.payload_json).uploads.totalVisibleItems).toBe(1);
  } finally {
    await context.database.destroy();
  }
});

it("does not freeze a request when rendering fails before provider handoff", async () => {
  const context = await _fixture();
  try {
    await runDailyDigests({ database: context.database, now: NOW });
    vi.spyOn(dailyDigestEmail, "render").mockRejectedValueOnce(
      new Error("render failed"),
    );
    await runMailQueueOnce({
      database: context.database,
      sender: context.sender,
      now: NOW,
    });
    expect(context.sender.send).not.toHaveBeenCalled();
    const batch = await context.database
      .selectFrom("notification_digest_batches")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(batch.provider_attempted_at).toBeNull();
    expect(batch.delivery_snapshot_json).toBeNull();
  } finally {
    await context.database.destroy();
  }
});

it("missing sender defers the original batch without a provider snapshot", async () => {
  const context = await _fixture();
  try {
    await runDailyDigests({ database: context.database, now: NOW });
    const result = await runMailQueueOnce({
      database: context.database,
      sender: undefined,
      now: NOW,
    });
    expect(result.deferredCount).toBe(1);
    await runDailyDigests({ database: context.database, now: NOW });
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    expect(
      (
        await context.database
          .selectFrom("notification_digest_batches")
          .select("provider_attempted_at")
          .executeTakeFirstOrThrow()
      ).provider_attempted_at,
    ).toBeNull();
  } finally {
    await context.database.destroy();
  }
});

it("cancels a retry when an overflow-only source loses visibility", async () => {
  const context = await _fixture(21);
  try {
    const { database, authorId, eventIds } = context;
    const overflowItemId = await insertItem(database, {
      uploadedBy: authorId,
      seq: 2,
    });
    const lastEvent = await database
      .selectFrom("notification_digest_events")
      .select("source_id")
      .where("id", "=", eventIds.at(-1)!)
      .executeTakeFirstOrThrow();
    await database
      .updateTable("comments")
      .set({ item_id: overflowItemId })
      .where("id", "=", lastEvent.source_id)
      .execute();
    await runDailyDigests({ database, now: NOW });
    const sender = {
      send: vi.fn(async () => {
        throw new Error("provider timeout");
      }),
    };
    await runMailQueueOnce({ database, sender, now: NOW });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await database
      .updateTable("items")
      .set({ visibility_rule_id: ruleId })
      .where("id", "=", overflowItemId)
      .execute();
    await runMailQueueOnce({
      database,
      sender,
      now: "2026-11-03T10:02:00.000Z",
    });
    expect(sender.send).toHaveBeenCalledOnce();
    expect(
      (
        await database
          .selectFrom("outbound_emails")
          .select("state")
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("cancelled");
  } finally {
    await context.database.destroy();
  }
});

it("uses new timezone settings for pending events but preserves prepared batch dates", async () => {
  const context = await _fixture();
  try {
    const { database, eventIds } = context;
    await database
      .updateTable("notification_digest_events")
      .set({ occurred_at: "2026-11-03T04:00:00.000Z" })
      .where("id", "=", eventIds[0]!)
      .execute();
    expect((await runDailyDigests({ database, now: NOW })).preparedCount).toBe(
      0,
    );
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "America/New_York",
    });
    await runDailyDigests({ database, now: "2026-11-03T14:00:00.000Z" });
    const batch = await database
      .selectFrom("notification_digest_batches")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(batch.timezone).toBe("America/New_York");
    expect(batch.send_date).toBe("2026-11-03");
    await database
      .updateTable("settings")
      .set({ value: JSON.stringify("Asia/Kathmandu") })
      .where("key", "=", "shoebox.timezone")
      .execute();
    await runDailyDigests({ database, now: "2026-11-03T14:01:00.000Z" });
    expect(
      await database
        .selectFrom("notification_digest_batches")
        .selectAll()
        .execute(),
    ).toEqual([batch]);
  } finally {
    await context.database.destroy();
  }
});

it("rechecks retry membership atomically after an interleaved removal", async () => {
  const context = await _fixture();
  try {
    const { database, memberId } = context;
    await runDailyDigests({ database, now: NOW });
    const sender = {
      send: vi.fn(async () => {
        throw new Error("provider timeout");
      }),
    };
    await runMailQueueOnce({ database, sender, now: NOW });
    const memberQuery = database.selectFrom("members").selectAll();
    const prototype = Object.getPrototypeOf(memberQuery) as typeof memberQuery;
    const executeTakeFirst = prototype.executeTakeFirst;
    let shouldRemove = true;
    vi.spyOn(prototype, "executeTakeFirst").mockImplementation(
      async function (this: typeof memberQuery) {
        const result = await executeTakeFirst.call(this);
        if (
          shouldRemove &&
          this.compile().sql.startsWith('select * from "members"')
        ) {
          shouldRemove = false;
          await database
            .updateTable("members")
            .set({ status: "removed" })
            .where("id", "=", memberId)
            .execute();
        }
        return result;
      },
    );
    await runMailQueueOnce({
      database,
      sender,
      now: "2026-11-03T10:02:00.000Z",
    });
    expect(shouldRemove).toBe(false);
    expect(sender.send).toHaveBeenCalledOnce();
    expect(
      (
        await database
          .selectFrom("outbound_emails")
          .select("state")
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("cancelled");
  } finally {
    vi.restoreAllMocks();
    await context.database.destroy();
  }
});

it.each([
  [
    "Asia/Kathmandu",
    "2026-11-02T18:14:59.999Z",
    "2026-11-02T18:15:00.000Z",
    "2026-11-03T03:15:00.000Z",
    "2026-11-02",
  ],
  [
    "America/Santiago",
    "2026-09-06T03:59:59.999Z",
    "2026-09-06T04:00:00.000Z",
    "2026-09-06T12:00:00.000Z",
    "2026-09-05",
  ],
])(
  "selects overdue events across the actual midnight boundary in %s",
  async (timezone, beforeMidnight, dayStart, now, expectedDay) => {
    const context = await _fixture(2);
    try {
      const { database, eventIds } = context;
      await insertInstanceSetting(database, {
        key: "shoebox.timezone",
        value: timezone!,
      });
      await database
        .updateTable("notification_digest_events")
        .set({ occurred_at: beforeMidnight! })
        .where("id", "=", eventIds[0]!)
        .execute();
      await database
        .updateTable("notification_digest_events")
        .set({ occurred_at: dayStart! })
        .where("id", "=", eventIds[1]!)
        .execute();
      await runDailyDigests({ database, now: now! });
      const payload = JSON.parse(
        (
          await database
            .selectFrom("outbound_emails")
            .select("payload_json")
            .executeTakeFirstOrThrow()
        ).payload_json,
      );
      expect(payload.comments.totalEvents).toBe(1);
      expect(payload.periodStart).toBe(expectedDay);
      expect(
        await database
          .selectFrom("notification_digest_events")
          .select("id")
          .where("state", "=", "pending")
          .execute(),
      ).toEqual([{ id: eventIds[1] }]);
    } finally {
      await context.database.destroy();
    }
  },
);

it("retains a frozen request and does not reclaim a sending row after provider intent", async () => {
  const context = await _fixture();
  try {
    const { database } = context;
    await runDailyDigests({ database, now: NOW });
    const sender = {
      send: vi.fn(async () => {
        throw new Error("ambiguous result");
      }),
    };
    await runMailQueueOnce({ database, sender, now: NOW });
    const batch = await database
      .selectFrom("notification_digest_batches")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(batch.provider_attempted_at).toBe(NOW);
    expect(batch.delivery_snapshot_json).not.toBeNull();
    // Model the durable state of a process lost between intent and finalization.
    await database
      .updateTable("outbound_emails")
      .set({ state: "sending", attempts: 0, next_attempt_at: null })
      .execute();
    const stranded = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    await runDailyDigests({ database, now: "2026-11-04T10:00:00.000Z" });
    await runMailQueueOnce({
      database,
      sender,
      now: "2026-11-04T10:00:00.000Z",
    });
    expect(sender.send).toHaveBeenCalledOnce();
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual([stranded]);
    expect(
      await database
        .selectFrom("notification_digest_batches")
        .selectAll()
        .execute(),
    ).toEqual([batch]);
  } finally {
    await context.database.destroy();
  }
});
