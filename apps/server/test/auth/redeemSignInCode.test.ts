import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  NOW,
  insertInstanceSetting,
  insertInvitation,
  insertItem,
  insertMember,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("redeemSignInCode", () => {
  let database: Kysely<Database>;

  /** Mints one code the way the request route does. */
  async function mint(email: string, now = NOW) {
    return runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return mintSignInCode({ transaction, email, pepper: PEPPER, now });
      },
    });
  }

  /** Redeems, with the defaults a route would pass. */
  async function redeem(options: {
    email: string;
    code: string;
    now?: string;
    presentedToken?: string;
  }) {
    return redeemSignInCode({
      database,
      email: options.email,
      code: options.code,
      pepper: PEPPER,
      now: options.now ?? NOW,
      userAgent: USER_AGENT,
      presentedToken: options.presentedToken,
    });
  }

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
  });

  it("is expired when no code was ever asked for", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    expect(await redeem({ email: "rosa@example.com", code: "410233" })).toEqual(
      {
        kind: "expired",
      },
    );
  });

  it("is expired past ten minutes, and writes nothing", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const minted = await mint("rosa@example.com");

    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
      now: shiftMinutes({ instant: NOW, minutes: 11 }),
    });

    expect(outcome).toEqual({ kind: "expired" });
    const row = await database
      .selectFrom("sign_in_codes")
      .select(["attempts", "consumed_at"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ attempts: 0, consumed_at: null });
  });

  it("is expired for a code that has already been used", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const minted = await mint("rosa@example.com");
    await redeem({ email: "rosa@example.com", code: minted.digits });

    expect(
      await redeem({ email: "rosa@example.com", code: minted.digits }),
    ).toEqual({ kind: "expired" });
  });

  it("counts down from three on a wrong code", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    await mint("rosa@example.com");

    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "invalid",
        attemptsRemaining: 2,
      },
    );
    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "invalid",
        attemptsRemaining: 1,
      },
    );
  });

  it("mints a replacement on the third wrong code", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const first = await mint("rosa@example.com");

    await redeem({ email: "rosa@example.com", code: "000000" });
    await redeem({ email: "rosa@example.com", code: "000000" });
    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "exhausted",
      },
    );

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "invalidated_at"])
      .orderBy("id", "asc")
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: first.codeId, invalidated_at: NOW });
    expect(rows[1]?.invalidated_at).toBeNull();

    // The copy promises it, so the replacement is really sent.
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(2);
  });

  it("treats a correct guess at an unknown address as a wrong one", async () => {
    // One chance in a million per attempt, and it must not be
    // distinguishable from a miss (`auth.md`, transformation 4).
    const minted = await mint("nobody@example.com");

    expect(
      await redeem({ email: "nobody@example.com", code: minted.digits }),
    ).toEqual({ kind: "invalid", attemptsRemaining: 2 });
  });

  it("treats a removed member's correct code as a wrong one", async () => {
    await insertMember(database, {
      email: "gone@example.com",
      status: "removed",
      removed_at: NOW,
    });
    const minted = await mint("gone@example.com");

    expect(
      await redeem({ email: "gone@example.com", code: minted.digits }),
    ).toEqual({ kind: "invalid", attemptsRemaining: 2 });
  });

  it("creates a session, labelled and hashed, on the right code", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const minted = await mint("rosa@example.com");

    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
    });
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") {
      return;
    }

    const row = await database
      .selectFrom("sessions")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.id).toBe(outcome.session.sessionId);
    expect(row.member_id).toBe(memberId);
    expect(row.device_label).toBe("iPhone, Safari");
    expect(row.user_agent).toBe(USER_AGENT);
    expect(row.token_hash).toBe(makeTokenHashFromToken(outcome.session.token));
    expect(row.expires_at).toBe(shiftDays({ instant: NOW, days: 30 }));

    const code = await database
      .selectFrom("sign_in_codes")
      .select("consumed_at")
      .executeTakeFirstOrThrow();
    expect(code.consumed_at).toBe(NOW);
  });

  it("writes last_signed_in_at on every redemption", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_signed_in_at: null,
    });
    const minted = await mint("rosa@example.com");
    await redeem({ email: "rosa@example.com", code: minted.digits });

    const row = await database
      .selectFrom("members")
      .select("last_signed_in_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.last_signed_in_at).toBe(NOW);
  });

  it("accepts the invitation and seeds the archive on a first sign-in", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    const memberId = await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
      last_signed_in_at: null,
    });
    const invitationId = await insertInvitation(database, {
      memberId,
      invitedByMemberId: adminId,
    });
    const itemId = await insertItem(database, { uploadedBy: adminId });

    const minted = await mint("ines@example.com");
    const outcome = await redeem({
      email: "ines@example.com",
      code: minted.digits,
    });
    expect(outcome).toMatchObject({ isFirstSignIn: true });

    const member = await database
      .selectFrom("members")
      .select(["joined_at", "status"])
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member).toEqual({ joined_at: NOW, status: "active" });

    const invitation = await database
      .selectFrom("invitations")
      .select("accepted_at")
      .where("id", "=", invitationId)
      .executeTakeFirstOrThrow();
    expect(invitation.accepted_at).toBe(NOW);

    // The accent dot means "arrived since you joined", so every item that
    // already exists is seeded as seen, with no visibility predicate at all.
    const views = await database.selectFrom("item_views").selectAll().execute();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      member_id: memberId,
      item_id: itemId,
      first_seen_at: NOW,
      first_opened_at: null,
      open_count: 0,
    });
  });

  it("seeds items the new member cannot see, which is the point", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    const outsiderId = await insertMember(database, {
      email: "tia@example.com",
    });
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
    });
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: restrictedRuleId,
      memberId: outsiderId,
    });

    // Two items, one of them restricted to somebody else. Filtering the seed
    // by visibility would light the second one up later, the day a rule
    // changed.
    await insertItem(database, { uploadedBy: adminId });
    await insertItem(database, {
      uploadedBy: adminId,
      seq: 1,
      visibility_rule_id: restrictedRuleId,
    });

    const minted = await mint("ines@example.com");
    await redeem({ email: "ines@example.com", code: minted.digits });

    const views = await database
      .selectFrom("item_views")
      .select("id")
      .execute();
    expect(views).toHaveLength(2);
  });

  it("does not seed or re-accept on a second sign-in", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    await insertMember(database, {
      email: "rosa@example.com",
      joined_at: NOW,
    });
    await insertItem(database, { uploadedBy: adminId });

    const minted = await mint("rosa@example.com");
    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
    });

    expect(outcome).toMatchObject({ isFirstSignIn: false });
    const views = await database
      .selectFrom("item_views")
      .select("id")
      .execute();
    expect(views).toEqual([]);
  });

  it("deletes the session the presented cookie still resolves to", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const oldSessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("an-old-token"),
    });
    const minted = await mint("rosa@example.com");

    await redeem({
      email: "rosa@example.com",
      code: minted.digits,
      presentedToken: "an-old-token",
    });

    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", oldSessionId)
      .execute();
    expect(rows).toEqual([]);
  });

  it("gives three attempts in total to two submissions at once", async () => {
    // Without BEGIN IMMEDIATE each submission reads attempts = 0 and each
    // gets three tries (`data-models.md` § `sign_in_codes`).
    await insertMember(database, { email: "rosa@example.com" });
    const first = await mint("rosa@example.com");

    await Promise.all([
      redeem({ email: "rosa@example.com", code: "000000" }),
      redeem({ email: "rosa@example.com", code: "000000" }),
      redeem({ email: "rosa@example.com", code: "000000" }),
    ]);

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "attempts", "invalidated_at"])
      .orderBy("id", "asc")
      .execute();
    expect(rows[0]).toEqual({
      id: first.codeId,
      attempts: 3,
      invalidated_at: NOW,
    });
    expect(rows).toHaveLength(2);
  });
});
