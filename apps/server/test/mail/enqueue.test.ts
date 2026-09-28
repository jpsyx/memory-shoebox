import { describe, expect, it } from "vitest";
import { OUTBOUND_EMAIL_KINDS } from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueue.ts";
import {
  NOW,
  insertInstanceSetting,
  insertOutboundEmail,
} from "../helpers/seed.ts";

async function createContext(options: { withBaseUrl?: boolean } = {}) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  if (options.withBaseUrl !== false) {
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
  }
  return database;
}

function buildInput(overrides: Record<string, unknown> = {}) {
  const codeId = createId();
  return {
    kind: "sign_in_code" as const,
    toAddress: " Rosa@Example.com ",
    toMemberId: null,
    toDisplayName: "Abuela Rosa",
    idempotencyKey: `signin:${codeId}`,
    payload: {
      code: "410233",
      expiresAt: "2026-09-27T10:10:00.000Z",
      expiresInMinutes: 10,
    },
    triggerKind: "sign_in_code" as const,
    triggerId: codeId,
    ...overrides,
  };
}

describe("enqueueEmail", () => {
  it("queues a row with the subject the template derives", async () => {
    const database = await createContext();

    const result = await enqueueEmail({
      executor: database,
      input: buildInput(),
      now: NOW,
    });

    expect(result.state).toBe("queued");
    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.subject).toBe("Your code is 410233");
    expect(row.state).toBe("queued");
    expect(row.send_after).toBe(NOW);
    expect(row.next_attempt_at).toBeNull();
    expect(row.attempts).toBe(0);
    await database.destroy();
  });

  it("normalises the address onto the row", async () => {
    const database = await createContext();

    await enqueueEmail({ executor: database, input: buildInput(), now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select("to_address")
      .executeTakeFirstOrThrow();
    expect(row.to_address).toBe("rosa@example.com");
    await database.destroy();
  });

  it("resolves EmailCommon from settings, so the renderer needs no query", async () => {
    const database = await createContext();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Casa Mateo",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Europe/Madrid",
    });

    await enqueueEmail({ executor: database, input: buildInput(), now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select("payload_json")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(row.payload_json)).toMatchObject({
      shoeboxName: "Casa Mateo",
      timezone: "Europe/Madrid",
      baseUrl: "https://shoebox.example",
      toDisplayName: "Abuela Rosa",
      preferencesUrl: null,
      code: "410233",
    });
    await database.destroy();
  });

  it("writes a failed row and does not throw when public.base_url is unset", async () => {
    const database = await createContext({ withBaseUrl: false });

    const result = await enqueueEmail({
      executor: database,
      input: buildInput(),
      now: NOW,
    });

    expect(result.state).toBe("failed");
    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("base_url_unset");
    expect(row.last_error_message).toContain("public.base_url");
    await database.destroy();
  });

  it("lets the caller's transaction commit even with no base URL", async () => {
    const database = await createContext({ withBaseUrl: false });

    await database.transaction().execute(async (transaction) => {
      // A direct insert rather than `insertInstanceSetting`, whose first
      // parameter is a `Kysely<Database>` handle rather than a transaction.
      await transaction
        .insertInto("settings")
        .values({
          id: createId(),
          scope: "instance",
          scope_id: null,
          key: "shoebox.name",
          value: JSON.stringify("Casa Mateo"),
          updated_at: NOW,
          updated_by_member_id: null,
        })
        .execute();
      await enqueueEmail({
        executor: transaction,
        input: buildInput(),
        now: NOW,
      });
    });

    const settings = await database
      .selectFrom("settings")
      .select("key")
      .where("key", "=", "shoebox.name")
      .execute();
    expect(settings).toHaveLength(1);
    await database.destroy();
  });

  it("is idempotent: the same key twice writes one row", async () => {
    const database = await createContext();
    const input = buildInput();

    const first = await enqueueEmail({ executor: database, input, now: NOW });
    const second = await enqueueEmail({ executor: database, input, now: NOW });

    expect(first.state).toBe("queued");
    expect(second.state).toBe("already_enqueued");
    expect(second.emailId).toBe(first.emailId);
    expect(
      await database.selectFrom("outbound_emails").select("id").execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("honours sendAfter, which only the reminder job sets", async () => {
    const database = await createContext();

    await enqueueEmail({
      executor: database,
      input: buildInput({ sendAfter: "2026-10-04T10:00:00.000Z" }),
      now: NOW,
    });

    const row = await database
      .selectFrom("outbound_emails")
      .select("send_after")
      .executeTakeFirstOrThrow();
    expect(row.send_after).toBe("2026-10-04T10:00:00.000Z");
    await database.destroy();
  });
});

describe("outbound_emails.idempotency_key", () => {
  it("is rejected by the constraint, not by application code", async () => {
    const database = await createContext();
    await insertOutboundEmail(database, { idempotency_key: "signin:one" });

    await expect(
      insertOutboundEmail(database, { idempotency_key: "signin:one" }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    await database.destroy();
  });
});

describe("outbound_emails.kind", () => {
  it("accepts every kind the shared contract names", async () => {
    const database = await createContext();

    for (const [index, kind] of OUTBOUND_EMAIL_KINDS.entries()) {
      await insertOutboundEmail(database, {
        kind,
        idempotency_key: `kind:${index}`,
      });
    }

    expect(
      await database.selectFrom("outbound_emails").select("id").execute(),
    ).toHaveLength(OUTBOUND_EMAIL_KINDS.length);
    await database.destroy();
  });

  it("rejects a kind the contract does not name, reaction above all", async () => {
    const database = await createContext();

    await expect(
      insertOutboundEmail(database, {
        kind: "reaction",
        idempotency_key: "kind:reaction",
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await database.destroy();
  });
});
