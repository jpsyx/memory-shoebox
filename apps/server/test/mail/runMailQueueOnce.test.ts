import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { createRecordingMailSender } from "../helpers/createRecordingMailSender.ts";
import {
  NOW,
  insertInstanceSetting,
  insertOutboundEmail,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

async function createContext(options: { configured?: boolean } = {}) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  if (options.configured !== false) {
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "My Shoebox",
    });
  }
  return { database, sender: createRecordingMailSender() };
}

async function queueSignInCode(
  database: Awaited<ReturnType<typeof createContext>>["database"],
) {
  const codeId = createId();
  await enqueueEmail({
    executor: database,
    now: NOW,
    input: {
      kind: "sign_in_code",
      toAddress: "rosa@example.com",
      toMemberId: null,
      toDisplayName: "Abuela Rosa",
      idempotencyKey: `signin:${codeId}`,
      payload: {
        code: "410233",
        expiresAt: shiftMinutes(NOW, 10),
        expiresInMinutes: 10,
      },
      triggerKind: "sign_in_code",
      triggerId: codeId,
    },
  });
}

describe("the mail worker", () => {
  it("does nothing against an empty queue", async () => {
    const { database, sender } = await createContext();

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toEqual({
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      deferredCount: 0,
    });
    expect(sender.sent).toEqual([]);
    await database.destroy();
  });

  it("sends a queued message and marks it sent", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    expect(sender.sent[0]?.from).toBe("My Shoebox <shoebox@example.com>");
    expect(sender.sent[0]?.to).toBe("rosa@example.com");
    expect(sender.sent[0]?.subject).toBe("Your code is 410233");
    expect(sender.sent[0]?.html).toContain("410233");
    expect(sender.sent[0]?.text).toContain("410233");

    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("sent");
    expect(row.sent_at).toBe(NOW);
    expect(row.from_address).toBe("shoebox@example.com");
    expect(row.provider_message_id).toBe("fake-1");
    await database.destroy();
  });

  it("scrubs both payload_json and subject on a terminal sign_in_code row", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("claims each row once, so a second run finds nothing", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });
    const second = await runMailQueueOnce({ database, sender, now: NOW });

    expect(second.sentCount).toBe(0);
    expect(sender.sent).toHaveLength(1);
    await database.destroy();
  });

  it("leaves a row whose send_after has not arrived", async () => {
    const { database, sender } = await createContext();
    await insertOutboundEmail(database, {
      send_after: shiftMinutes(NOW, 60),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toEqual({
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      deferredCount: 0,
    });
    expect(sender.sent).toEqual([]);
    // Left alone means untouched, not merely unsent: a worker that claimed
    // the row, spent an attempt and failed it would send nothing either.
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "next_attempt_at", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.next_attempt_at).toBeNull();
    expect(row.last_error_code).toBeNull();
    await database.destroy();
  });

  it("suppresses a non-sign-in message to a suppressed address, without sending", async () => {
    const { database, sender } = await createContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.suppressedCount).toBe(1);
    expect(sender.sent).toEqual([]);
    const row = await database
      .selectFrom("outbound_emails")
      .select("state")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("suppressed");
    await database.destroy();
  });

  it("still sends a sign-in code to a suppressed address", async () => {
    const { database, sender } = await createContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    await database.destroy();
  });

  it("defers rather than spending an attempt when mail.from_address is unset", async () => {
    const { database, sender } = await createContext({ configured: false });
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toMatchObject({ deferredCount: 1, sentCount: 0 });
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code", "next_attempt_at"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("from_address_unset");
    expect(row.next_attempt_at).toBe(shiftMinutes(NOW, 5));
    await database.destroy();
  });

  it("defers the same way when there is no API key at all", async () => {
    const { database } = await createContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({
      database,
      sender: undefined,
      now: NOW,
    });

    expect(summary.deferredCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("provider_unconfigured");
    await database.destroy();
  });

  it("backs off a refusal, and gives up after the fifth attempt", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);
    sender.failWith = {
      code: "validation_error",
      message: "domain not verified",
    };

    const backoffMinutes = [1, 5, 25, 120];
    let at = NOW;
    for (const [index, minutes] of backoffMinutes.entries()) {
      const summary = await runMailQueueOnce({ database, sender, now: at });
      expect(summary.failedCount).toBe(1);
      const row = await database
        .selectFrom("outbound_emails")
        .select(["state", "attempts", "next_attempt_at", "last_error_code"])
        .executeTakeFirstOrThrow();
      expect(row.state).toBe("queued");
      expect(row.attempts).toBe(index + 1);
      expect(row.last_error_code).toBe("validation_error");
      expect(row.next_attempt_at).toBe(shiftMinutes(at, minutes));
      at = shiftMinutes(at, minutes);
    }

    await runMailQueueOnce({ database, sender, now: at });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("fails a kind whose copy has not been written yet", async () => {
    const { database, sender } = await createContext();
    await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.failedCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.last_error_code).toBe("no_template");
    await database.destroy();
  });

  it("scrubs a sign-in code it cannot render, because that row is terminal too", async () => {
    // `sign_in_code` has copy today, so the only way to reach the no-template
    // branch with that kind is to take the copy away. This is the case a later
    // step creates by shipping a caller before its template: the row goes
    // terminal holding six live-looking digits in its subject line.
    vi.resetModules();
    vi.doMock("../../src/mail/templates/emailTemplates.constants.ts", () => {
      return { EMAIL_RENDERERS: {} };
    });
    const { runMailQueueOnce: runWithNoTemplates } =
      await import("../../src/mail/runMailQueueOnce.ts");

    const { database, sender } = await createContext();
    await insertOutboundEmail(database, {
      subject: "Your code is 410233",
      payload_json: JSON.stringify({ code: "410233" }),
    });

    const summary = await runWithNoTemplates({ database, sender, now: NOW });

    expect(summary.failedCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "last_error_code", "subject", "payload_json"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.last_error_code).toBe("no_template");
    expect(row.subject).toBe("Your code");
    expect(row.payload_json).toBe("{}");
    await database.destroy();
    vi.doUnmock("../../src/mail/templates/emailTemplates.constants.ts");
    vi.resetModules();
  });
  it("claims each row once when two passes run at the same time", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);
    await queueSignInCode(database);

    const [first, second] = await Promise.all([
      runMailQueueOnce({ database, sender, now: NOW }),
      runMailQueueOnce({ database, sender, now: NOW }),
    ]);

    expect(first.sentCount + second.sentCount).toBe(2);
    expect(sender.sent).toHaveLength(2);
    const keys = sender.sent.map((request) => {
      return request.idempotencyKey;
    });
    expect(new Set(keys).size).toBe(2);
    const states = await database
      .selectFrom("outbound_emails")
      .select("state")
      .execute();
    expect(
      states.map((row) => {
        return row.state;
      }),
    ).toEqual(["sent", "sent"]);
    await database.destroy();
  });

  it("leaves an attempt count it did not spend alone when it defers", async () => {
    const { database, sender } = await createContext({ configured: false });
    await insertOutboundEmail(database, {
      attempts: 3,
      next_attempt_at: shiftMinutes(NOW, -1),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.deferredCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "next_attempt_at"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(3);
    expect(row.next_attempt_at).toBe(shiftMinutes(NOW, 5));
    await database.destroy();
  });
});
