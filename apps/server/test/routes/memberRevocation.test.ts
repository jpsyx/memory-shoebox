import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertSession,
  insertInvitation,
  insertGroup,
  insertGroupMember,
  insertItem,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";
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
    member: { role: "admin" },
  });
  return {
    ...fixture,
    admin,
    revoke: (path: string, cookie = admin.cookie) => {
      return fixture.app.inject({
        method: "DELETE",
        url: `/api/members/${path}`,
        headers: { cookie },
      });
    },
  };
}

describe("member revocation", () => {
  it("revokes invited authority atomically, preserves uploads, and makes an already issued correct code unusable", async () => {
    const { database, admin, revoke, close } = await _fixture();
    const memberId = await insertMember(database, {
      email: "invitee@example.com",
      status: "invited",
      role: "admin",
    });
    await insertInvitation(database, {
      memberId,
      invitedByMemberId: admin.memberId,
    });
    await insertSession(database, { memberId });
    const groupId = await insertGroup(database);
    await insertGroupMember(database, { groupId, memberId });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const pepper = Buffer.from("a".repeat(64), "hex");
    const minted = await runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return mintSignInCode({
          transaction,
          email: "invitee@example.com",
          pepper,
          now: NOW,
        });
      },
    });
    const response = await revoke(`${memberId}/invitation`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "removed",
      removedAt: NOW,
      invitation: { revokedAt: NOW },
      sessions: [],
    });
    expect(
      await database.selectFrom("group_members").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await database
        .selectFrom("sessions")
        .selectAll()
        .where("member_id", "=", memberId)
        .execute(),
    ).toHaveLength(0);
    expect(
      (
        await database
          .selectFrom("items")
          .select("uploaded_by")
          .where("id", "=", itemId)
          .executeTakeFirstOrThrow()
      ).uploaded_by,
    ).toBe(memberId);
    expect(
      await redeemSignInCode({
        database,
        email: "invitee@example.com",
        code: minted.digits,
        pepper,
        now: NOW,
        userAgent: undefined,
        presentedToken: undefined,
      }),
    ).toMatchObject({ kind: "invalid" });
    const events = await database
      .selectFrom("activity_events")
      .selectAll()
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("invitation_revoked");
    expect(JSON.parse(events[0]?.detail_json ?? "null")).toEqual({
      fromStatus: "invited",
      toStatus: "removed",
    });
    expect(
      (
        await database
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "visibility.generation")
          .executeTakeFirstOrThrow()
      ).value,
    ).toBe("1");
    expect((await revoke(`${memberId}/invitation`)).json().error).toBe(
      "invitations_not_pending",
    );
    await close();
  });
  it.each(["active", "removed", "accepted", "revoked", "absent"])(
    "refuses invitation revocation for %s",
    async (state) => {
      const { database, admin, revoke, close } = await _fixture();
      const memberId = await insertMember(database, {
        status: state === "active" || state === "removed" ? state : "invited",
      });
      if (state !== "absent") {
        await insertInvitation(database, {
          memberId,
          invitedByMemberId: admin.memberId,
          ...(state === "accepted" ? { accepted_at: NOW } : {}),
          ...(state === "revoked" ? { revoked_at: NOW } : {}),
        });
      }
      const response = await revoke(`${memberId}/invitation`);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("invitations_not_pending");
      await close();
    },
  );
  it("revokes another device immediately, with missing/mismatched parity and surviving device label", async () => {
    const { app, database, admin, revoke, close } = await _fixture();
    const member = await insertSignedInMember({
      database,
      token: "other",
      session: { device_label: "Other phone" },
    });
    const absent = await revoke(`${member.memberId}/sessions/${createId()}`);
    const mismatched = await revoke(
      `${member.memberId}/sessions/${admin.sessionId}`,
    );
    expect(absent.statusCode).toBe(404);
    expect(mismatched.body).toBe(absent.body);
    expect(absent.json().error).toBe("sessions_not_found");
    const response = await revoke(
      `${member.memberId}/sessions/${member.sessionId}`,
    );
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie: member.cookie } }))
        .statusCode,
    ).toBe(401);
    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      kind: "device_revoked",
      actor_member_id: admin.memberId,
      subject_kind: "session",
      subject_id: member.sessionId,
      subject_label: "Other phone",
      device_label: "Other phone",
    });
    expect(
      await database.selectFrom("settings").selectAll().execute(),
    ).toHaveLength(0);
    await close();
  });
  it("allows revoking the current admin session", async () => {
    const { app, admin, revoke, close } = await _fixture();
    expect(
      (await revoke(`${admin.memberId}/sessions/${admin.sessionId}`))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie: admin.cookie } }))
        .statusCode,
    ).toBe(401);
    await close();
  });
  it.each(["invitation", "sessions"])(
    "refuses unknown and unauthorized %s revocations",
    async (action) => {
      const { app, database, admin, revoke, close } = await _fixture();
      const suffix =
        action === "sessions" ? `sessions/${admin.sessionId}` : "invitation";
      expect((await revoke(`${createId()}/${suffix}`)).json().error).toBe(
        "members_not_found",
      );
      const viewer = await insertSignedInMember({
        database,
        token: "viewer",
        member: { role: "viewer" },
      });
      expect(
        (await revoke(`${admin.memberId}/${suffix}`, viewer.cookie)).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/members/${admin.memberId}/${suffix}`,
          })
        ).statusCode,
      ).toBe(401);
      await close();
    },
  );
});
