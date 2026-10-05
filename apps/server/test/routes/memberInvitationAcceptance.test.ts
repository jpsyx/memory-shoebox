import type {
  Database,
  DatabaseExecutor,
} from "../../src/db/types/db.types.ts";
import type { SignedInMember } from "../helpers/insertSignedInMember.ts";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";
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

type ExpectRestoredInvitationHistoryOptions = {
  database: DatabaseExecutor;
  memberId: string;
  joinedAt: string;
  invitationId: string;
  previousInvitationId: string;
  historicalViews: Array<Database["item_views"]>;
};

async function _expectRestoredInvitationHistory(
  options: Readonly<ExpectRestoredInvitationHistoryOptions>,
): Promise<void> {
  const {
    database,
    memberId,
    joinedAt,
    invitationId,
    previousInvitationId,
    historicalViews,
  } = options;
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
}

type ExpectAcceptedInvitationSessionOptions = {
  app: FastifyInstance;
  sessionCookie: string;
  database: DatabaseExecutor;
  memberId: string;
};

async function _expectAcceptedInvitationSession(
  options: Readonly<ExpectAcceptedInvitationSessionOptions>,
): Promise<void> {
  const { app, sessionCookie, database, memberId } = options;
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
}

type RestoredMemberFixtureResult = {
  database: DatabaseExecutor;
  memberId: string;
  app: FastifyInstance;
  admin: SignedInMember;
  joinedAt: string;
  previousInvitationId: string;
  close: () => Promise<void>;
};

async function _prepareRestoredMemberFixture(): Promise<RestoredMemberFixtureResult> {
  const { app, database, close } = await createOwnedTestApp({
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
  return {
    database,
    memberId,
    app,
    admin,
    joinedAt,
    previousInvitationId,
    close,
  };
}

async function _getAcceptedInvitationTokenFromMember(
  options: Readonly<{ database: DatabaseExecutor; memberId: string }>,
): Promise<string> {
  const { database, memberId } = options;
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
  return outcome.session.token;
}

describe("returning member invitation acceptance", () => {
  it("activates restored membership, preserves historical joins and views, and survives invitation lapse", async () => {
    const {
      database,
      memberId,
      app,
      admin,
      joinedAt,
      previousInvitationId,
      close,
    } = await _prepareRestoredMemberFixture();
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
    const sessionToken = await _getAcceptedInvitationTokenFromMember({
      database,
      memberId,
    });
    await _expectRestoredInvitationHistory({
      database,
      memberId,
      joinedAt,
      invitationId,
      previousInvitationId,
      historicalViews,
    });
    await _expectAcceptedInvitationSession({
      app,
      sessionCookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      database,
      memberId,
    });
    await close();
  });
});
