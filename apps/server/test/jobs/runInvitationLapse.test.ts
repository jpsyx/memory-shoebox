import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  NOW,
  insertMember,
  insertInvitation,
  insertSession,
  insertGroup,
  insertGroupMember,
  shiftDays,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { runInvitationLapse } from "../../src/jobs/runInvitationLapse.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";

async function _fixture() {
  const fixture = await createTestApp();
  const adminId = await insertMember(fixture.database, { role: "admin" });
  const memberId = await insertMember(fixture.database, {
    status: "invited",
    email: "invitee@example.com",
  });
  await insertInvitation(fixture.database, {
    memberId,
    invitedByMemberId: adminId,
    expires_at: shiftDays({ instant: NOW, days: -1 }),
  });
  await insertSession(fixture.database, { memberId });
  const groupId = await insertGroup(fixture.database);
  await insertGroupMember(fixture.database, { groupId, memberId });
  return { ...fixture, adminId, memberId };
}

describe("invitation lapse authority cleanup", () => {
  it("atomically clears sessions/memberships and bumps visibility, preventing redemption of an issued code", async () => {
    const { database, memberId, close } = await _fixture();
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
    expect(await runInvitationLapse({ database, now: NOW })).toEqual({
      lapsedCount: 1,
    });
    expect(
      await database
        .selectFrom("sessions")
        .selectAll()
        .where("member_id", "=", memberId)
        .execute(),
    ).toHaveLength(0);
    expect(
      await database.selectFrom("group_members").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      (
        await database
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "visibility.generation")
          .executeTakeFirstOrThrow()
      ).value,
    ).toBe("1");
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
    expect(await runInvitationLapse({ database, now: NOW })).toEqual({
      lapsedCount: 0,
    });
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toHaveLength(0);
    await close();
  });
  it("rolls member status and all cleanup back when visibility invalidation fails", async () => {
    const { database, memberId, close } = await _fixture();
    await sql`CREATE TRIGGER reject_generation BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'forced generation failure'); END`.execute(
      database,
    );
    await expect(runInvitationLapse({ database, now: NOW })).rejects.toThrow(
      "forced generation failure",
    );
    expect(
      (
        await database
          .selectFrom("members")
          .select("status")
          .where("id", "=", memberId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("invited");
    expect(
      await database.selectFrom("sessions").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("group_members").selectAll().execute(),
    ).toHaveLength(1);
    await close();
  });
  it("uses only the latest pending invitation and retains unexpired renewed authority", async () => {
    const { database, adminId, memberId, close } = await _fixture();
    await insertInvitation(database, {
      memberId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: 1 }),
    });
    expect(await runInvitationLapse({ database, now: NOW })).toEqual({
      lapsedCount: 0,
    });
    expect(
      await database.selectFrom("sessions").selectAll().execute(),
    ).toHaveLength(1);
    await close();
  });
  it.each(["accepted", "revoked"])(
    "does not let older expired pending invitations override newer %s history",
    async (state) => {
      const { database, adminId, memberId, close } = await _fixture();
      await insertInvitation(database, {
        memberId,
        invitedByMemberId: adminId,
        expires_at: shiftDays({ instant: NOW, days: 1 }),
        ...(state === "accepted" ? { accepted_at: NOW } : { revoked_at: NOW }),
      });
      expect(await runInvitationLapse({ database, now: NOW })).toEqual({
        lapsedCount: 0,
      });
      expect(
        await database.selectFrom("group_members").selectAll().execute(),
      ).toHaveLength(1);
      await close();
    },
  );
});
