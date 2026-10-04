import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  adminMemberDtoSchema,
  invitationEmailPayloadSchema,
} from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createRecordingEmailService } from "../helpers/createRecordingEmailService.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  shiftDays,
  insertMember,
  insertItem,
  insertPerson,
  insertItemPerson,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertGroup,
  insertGroupMember,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";

async function _fixture() {
  const fixture = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const admin = await insertSignedInMember({
    database: fixture.database,
    member: { role: "admin", display_name: "Rosa", email: "rosa@example.com" },
  });
  await insertInstanceSetting(fixture.database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  return {
    ...fixture,
    admin,
    invite: (body: Record<string, unknown>) => {
      return fixture.app.inject({
        method: "POST",
        url: "/api/members",
        headers: { cookie: admin.cookie },
        payload: body,
      });
    },
  };
}

describe("member invitations", () => {
  it("atomically invites with the invitee's count and frozen attribution, then delivers after sender configuration", async () => {
    const fixture = await _fixture();
    const { database, admin, close, invite } = fixture;
    await insertItem(database, { uploadedBy: admin.memberId });
    const restricted = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: restricted,
      memberId: admin.memberId,
    });
    await insertItem(database, {
      uploadedBy: admin.memberId,
      visibility_rule_id: restricted,
      seq: 1,
    });
    await insertItem(database, {
      uploadedBy: admin.memberId,
      visibility_rule_id: restricted,
      seq: 2,
    });
    const response = await invite({
      email: " ANA+family@EXAMPLE.COM ",
      displayName: " Ana ",
      role: "viewer",
    });
    expect(response.statusCode).toBe(201);
    const member = adminMemberDtoSchema.parse(response.json());
    expect(member).toMatchObject({
      email: "ana+family@example.com",
      displayName: "Ana",
      status: "invited",
      role: "viewer",
      joinedAt: null,
      lastSignedInAt: null,
    });
    const invitation = await database
      .selectFrom("invitations")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(invitation.expires_at).toBe(shiftDays({ instant: NOW, days: 7 }));
    const queueRow = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(queueRow.idempotency_key).toBe(`invite:${invitation.id}:1`);
    expect(queueRow.to_member_id).toBe(member.memberId);
    const payload = invitationEmailPayloadSchema.parse(
      JSON.parse(queueRow.payload_json),
    );
    expect(payload).toMatchObject({
      visibleItemCount: 1,
      memberCount: 2,
      inviterDisplayName: "Rosa",
      inviterEmail: "rosa@example.com",
      invitedAddress: member.email,
      joinUrl:
        "https://shoebox.example/join?address=ana%2Bfamily%40example.com",
    });
    expect(
      (await database.selectFrom("activity_events").selectAll().execute())[0],
    ).toMatchObject({
      kind: "member_invited",
      subject_kind: "member",
      subject_id: member.memberId,
      actor_member_id: admin.memberId,
    });
    const sender = createRecordingEmailService();
    await runMailQueueOnce({ database, sender, now: NOW });
    expect(sender.sent).toHaveLength(0);
    await database
      .updateTable("members")
      .set({ display_name: "Changed", email: "changed@example.com" })
      .where("id", "=", admin.memberId)
      .execute();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Changed Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "mail@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "New sender",
    });
    await runMailQueueOnce({
      database,
      sender,
      now: shiftDays({ instant: NOW, days: 1 }),
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      from: "New sender <mail@example.com>",
      to: member.email,
      subject: "Rosa has added you to My Shoebox",
    });
    expect(sender.sent[0]?.text).toContain("rosa@example.com");
    expect(
      (
        await database
          .selectFrom("outbound_emails")
          .selectAll()
          .executeTakeFirstOrThrow()
      ).payload_json,
    ).toBe(queueRow.payload_json);
    await close();
  });
  it("reuses removed identity, timestamps, content and person links and expands its groups", async () => {
    const { database, admin, close, invite } = await _fixture();
    const memberId = await insertMember(database, {
      email: "returning@example.com",
      display_name: "Original",
      status: "removed",
      removed_at: NOW,
    });
    const personId = await insertPerson(database, {
      displayName: "Original",
      member_id: memberId,
    });
    const ownItemId = await insertItem(database, { uploadedBy: memberId });
    await insertItemPerson(database, { itemId: ownItemId, personId });
    const groupId = await insertGroup(database);
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });
    await insertItem(database, {
      uploadedBy: admin.memberId,
      seq: 2,
      visibility_rule_id: ruleId,
    });
    const response = await invite({
      email: "returning@example.com",
      role: "uploader",
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      memberId,
      displayName: "Original",
      joinedAt: NOW,
      lastSignedInAt: NOW,
      createdAt: NOW,
      removedAt: null,
    });
    expect(
      (
        await database
          .selectFrom("items")
          .selectAll()
          .where("id", "=", ownItemId)
          .executeTakeFirstOrThrow()
      ).uploaded_by,
    ).toBe(memberId);
    expect(
      await database.selectFrom("item_people").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      JSON.parse(
        (
          await database
            .selectFrom("outbound_emails")
            .selectAll()
            .executeTakeFirstOrThrow()
        ).payload_json,
      ).visibleItemCount,
    ).toBe(2);
    await close();
  });
  it.each([
    ["active", "members_already_active"],
    ["invited", "members_invitation_pending"],
  ] as const)(
    "refuses an existing %s identity without writing",
    async (status, error) => {
      const { database, close, invite } = await _fixture();
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
    const { database, close, invite } = await _fixture();
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
    const { database, close, invite } = await _fixture();
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
  it("uses prospective admin visibility", async () => {
    const { database, admin, close, invite } = await _fixture();
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
      const fixture = await createTestApp();
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
    const fixture = await _fixture();
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
