import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  shiftDays,
  insertInvitation,
  insertItem,
  insertItemView,
  insertMember,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { runInvitationLapse } from "../../src/jobs/runInvitationLapse.ts";

describe("returning member invitation acceptance", () => {
  it("activates restored membership, preserves historical joins and views, and survives invitation lapse", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const admin = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const joinedAt = shiftDays({ instant: NOW, days: -30 });
    const memberId = await insertMember(database, {
      email: "returning@example.com",
      status: "removed",
      removed_at: NOW,
      joined_at: joinedAt,
      last_signed_in_at: joinedAt,
    });
    const previousInvitationId = await insertInvitation(database, {
      memberId,
      invitedByMemberId: admin.memberId,
      created_at: joinedAt,
      accepted_at: joinedAt,
    });
    const oldItemId = await insertItem(database, {
      uploadedBy: admin.memberId,
    });
    await insertItemView(database, {
      memberId,
      itemId: oldItemId,
      first_seen_at: joinedAt,
      first_opened_at: joinedAt,
      last_opened_at: joinedAt,
      open_count: 2,
    });
    await insertItem(database, { uploadedBy: admin.memberId, seq: 1 });
    const historicalViews = await database
      .selectFrom("item_views")
      .selectAll()
      .where("member_id", "=", memberId)
      .execute();
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    const inviteResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { cookie: admin.cookie },
      payload: { email: "returning@example.com", role: "viewer" },
    });
    expect(inviteResponse.statusCode).toBe(201);
    const invitationId = inviteResponse.json().invitation.invitationId;
    const pepper = Buffer.from("a".repeat(64), "hex");
    const minted = await runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return mintSignInCode({
          transaction,
          email: "returning@example.com",
          pepper,
          now: NOW,
        });
      },
    });
    const outcome = await redeemSignInCode({
      database,
      email: "returning@example.com",
      code: minted.digits,
      pepper,
      now: NOW,
      userAgent: undefined,
      presentedToken: undefined,
    });
    expect(outcome).toMatchObject({
      kind: "created",
      memberId,
      isFirstSignIn: false,
    });
    if (outcome.kind !== "created") {
      throw new Error("Expected successful sign-in.");
    }
    expect(
      await database
        .selectFrom("members")
        .select(["status", "joined_at", "last_signed_in_at"])
        .where("id", "=", memberId)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      status: "active",
      joined_at: joinedAt,
      last_signed_in_at: NOW,
    });
    expect(
      await database
        .selectFrom("invitations")
        .select("accepted_at")
        .where("id", "=", invitationId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ accepted_at: NOW });
    expect(
      await database
        .selectFrom("invitations")
        .select("accepted_at")
        .where("id", "=", previousInvitationId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ accepted_at: joinedAt });
    expect(
      await database
        .selectFrom("item_views")
        .selectAll()
        .where("member_id", "=", memberId)
        .execute(),
    ).toEqual(historicalViews);
    const sessionCookie = `${SESSION_COOKIE_NAME}=${outcome.session.token}`;
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie: sessionCookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      await runInvitationLapse({
        database,
        now: shiftDays({ instant: NOW, days: 8 }),
      }),
    ).toEqual({ lapsedCount: 0 });
    expect(
      await database
        .selectFrom("members")
        .select("status")
        .where("id", "=", memberId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "active" });
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie: sessionCookie } }))
        .statusCode,
    ).toBe(200);
    await close();
  });
});
