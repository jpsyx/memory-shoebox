import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { mintSignInCode } from "../../../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../../../src/auth/redeemSignInCode.ts";
import { runInImmediateTransaction } from "../../../../src/db/runInImmediateTransaction.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { createMemberInvitationsFixture } from "./memberInvitationsTestHelpers.ts";

describe("member invitations", () => {
  it.each([
    ["active", "members_already_active"],
    ["invited", "members_invitation_pending"],
  ] as const)(
    "refuses an existing %s identity without writing",
    async (status, error) => {
      const { database, close, invite } =
        await createMemberInvitationsFixture();
      const memberId = await insertMember(database, {
        email: "existing@example.com",
        status,
      });
      const response = await invite({
        email: "existing@example.com",
        role: "viewer",
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error, details: { memberId } });
      expect(
        await database.selectFrom("invitations").selectAll().execute(),
      ).toHaveLength(0);
      expect(
        await database.selectFrom("activity_events").selectAll().execute(),
      ).toHaveLength(0);
      await close();
    },
  );

  it("rolls member, invitation and audit back when enqueue fails", async () => {
    const { database, close, invite } = await createMemberInvitationsFixture();
    await sql`CREATE TRIGGER reject_invitation_email BEFORE INSERT ON outbound_emails BEGIN SELECT RAISE(ABORT, 'forced enqueue failure'); END`.execute(
      database,
    );
    const response = await invite({ email: "ana@example.com", role: "viewer" });
    expect(response.statusCode).toBe(500);
    expect(
      await database.selectFrom("members").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("invitations").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toHaveLength(0);
    await close();
  });

  it("accepts a new invitation through the existing code sign-in", async () => {
    const { database, close, invite } = await createMemberInvitationsFixture();
    const response = await invite({ email: "ana@example.com", role: "admin" });
    expect(response.statusCode).toBe(201);
    const pepper = Buffer.from("a".repeat(64), "hex");
    const minted = await runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return mintSignInCode({
          transaction,
          email: "ana@example.com",
          pepper,
          now: NOW,
        });
      },
    });
    expect(
      await redeemSignInCode({
        database,
        email: "ana@example.com",
        code: minted.digits,
        pepper,
        now: NOW,
        userAgent: undefined,
        presentedToken: undefined,
      }),
    ).toMatchObject({ kind: "created" });
    expect(
      (
        await database
          .selectFrom("members")
          .selectAll()
          .where("email", "=", "ana@example.com")
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("active");
    expect(
      (
        await database
          .selectFrom("invitations")
          .selectAll()
          .executeTakeFirstOrThrow()
      ).accepted_at,
    ).toBe(NOW);
    await close();
  });

  it("includes a restricted item in an admin invitation's visible item count", async () => {
    const { database, admin, close, invite } =
      await createMemberInvitationsFixture();
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertItem(database, {
      uploadedBy: admin.memberId,
      visibility_rule_id: ruleId,
    });
    expect(
      (await invite({ email: "ana@example.com", role: "admin" })).statusCode,
    ).toBe(201);
    expect(
      JSON.parse(
        (
          await database
            .selectFrom("outbound_emails")
            .selectAll()
            .executeTakeFirstOrThrow()
        ).payload_json,
      ).visibleItemCount,
    ).toBe(1);
    await close();
  });

  it.each(["viewer", "uploader"] as const)(
    "refuses inviting as %s",
    async (role) => {
      const fixture = await createOwnedTestApp();
      const member = await insertSignedInMember({
        database: fixture.database,
        member: { role },
      });
      expect(
        (
          await fixture.app.inject({
            method: "POST",
            url: "/api/members",
            headers: { cookie: member.cookie },
            payload: { email: "ana@example.com", role: "viewer" },
          })
        ).statusCode,
      ).toBe(403);
      await fixture.close();
    },
  );

  it("rejects anonymous and invalid invites", async () => {
    const fixture = await createMemberInvitationsFixture();
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: "/api/members",
          payload: { email: "ana@example.com", role: "viewer" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await fixture.invite({ email: "bad", role: "viewer" })).statusCode,
    ).toBe(400);
    expect(
      (
        await fixture.invite({
          email: "ana@example.com",
          role: "viewer",
          status: "active",
        })
      ).statusCode,
    ).toBe(400);
    await fixture.close();
  });
});
