import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { makeCodeHashFromDigits } from "../../src/auth/signInCodeHelpers.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  NOW,
  insertInstanceSetting,
  insertMember,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");

/** Mints one code the way a route does, inside one immediate transaction. */
async function _mint(options: {
  database: Kysely<Database>;
  email: string;
  now?: string;
}) {
  return runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return mintSignInCode({
        transaction,
        email: options.email,
        pepper: PEPPER,
        now: options.now ?? NOW,
      });
    },
  });
}

describe("mintSignInCode", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    // Every message needs an absolute link, so an instance with no base URL
    // writes its mail `failed` rather than `queued`. Set it, or the enqueue
    // assertions below are testing the wrong branch.
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
  });

  it("writes a row for an address nobody has ever heard of", async () => {
    const minted = await _mint({ database, email: "nobody@example.com" });

    const row = await database
      .selectFrom("sign_in_codes")
      .selectAll()
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("nobody@example.com");
    expect(row.member_id).toBeNull();
    expect(row.attempts).toBe(0);
    expect(row.max_attempts).toBe(3);
    expect(row.expires_at).toBe(shiftMinutes({ instant: NOW, minutes: 10 }));
  });

  it("mails nothing for an address that is not a member", async () => {
    await _mint({ database, email: "nobody@example.com" });
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toEqual([]);
  });

  it("stores the code as an HMAC and never the digits", async () => {
    const minted = await _mint({ database, email: "nobody@example.com" });
    const row = await database
      .selectFrom("sign_in_codes")
      .select("code_hash")
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();

    expect(row.code_hash).not.toContain(minted.digits);
    expect(row.code_hash).toBe(
      makeCodeHashFromDigits({ digits: minted.digits, pepper: PEPPER }),
    );
  });

  it("queues one message to a member, keyed on the code", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      display_name: "Abuela Rosa",
    });
    const minted = await _mint({ database, email: "rosa@example.com" });

    const email = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(email.kind).toBe("sign_in_code");
    expect(email.to_address).toBe("rosa@example.com");
    expect(email.to_member_id).toBe(memberId);
    expect(email.idempotency_key).toBe(`signin:${minted.codeId}`);
    expect(email.state).toBe("queued");
    expect(email.subject).toBe(`Your code is ${minted.digits}`);
  });

  it("mails an invited member, who is accepting by signing in", async () => {
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
      last_signed_in_at: null,
    });
    await _mint({ database, email: "ines@example.com" });

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(1);
  });

  it("treats a removed member exactly as an unknown address", async () => {
    const memberId = await insertMember(database, {
      email: "gone@example.com",
      status: "removed",
      removed_at: NOW,
    });
    const minted = await _mint({ database, email: "gone@example.com" });

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toEqual([]);

    // The row still names them, because `sign_in_codes.member_id` is the
    // matching member and the redemption path is what refuses a removed one.
    const row = await database
      .selectFrom("sign_in_codes")
      .select("member_id")
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();
    expect(row.member_id).toBe(memberId);
  });

  it("supersedes the live code, so at most one is ever live", async () => {
    const first = await _mint({ database, email: "rosa@example.com" });
    const second = await _mint({
      database,
      email: "rosa@example.com",
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "invalidated_at"])
      .orderBy("created_at", "asc")
      .execute();
    expect(rows).toEqual([
      {
        id: first.codeId,
        invalidated_at: shiftMinutes({ instant: NOW, minutes: 1 }),
      },
      { id: second.codeId, invalidated_at: null },
    ]);
  });

  it("leaves another address's live code alone", async () => {
    const other = await _mint({ database, email: "ines@example.com" });
    await _mint({ database, email: "rosa@example.com" });

    const row = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .where("id", "=", other.codeId)
      .executeTakeFirstOrThrow();
    expect(row.invalidated_at).toBeNull();
  });

  it("does not touch a code that was already used", async () => {
    const first = await _mint({ database, email: "rosa@example.com" });
    await database
      .updateTable("sign_in_codes")
      .set({ consumed_at: NOW })
      .where("id", "=", first.codeId)
      .execute();

    await _mint({
      database,
      email: "rosa@example.com",
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    const row = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .where("id", "=", first.codeId)
      .executeTakeFirstOrThrow();
    expect(row.invalidated_at).toBeNull();
  });
});
