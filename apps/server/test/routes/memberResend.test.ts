import type { LightMyRequestResponse } from "fastify";
import type { TestApp } from "../helpers/createTestApp.ts";
import type { SignedInMember } from "../helpers/insertSignedInMember.ts";
type MemberResendFixture = TestApp & {
  admin: SignedInMember;
  memberId: string;
  invitationId: string;
  setNow: (instant: string) => void;
  resend: (
    options?: Readonly<{ targetId?: string; cookie?: string }>,
  ) => Promise<LightMyRequestResponse>;
};
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertInvitation,
  insertInstanceSetting,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";

async function _fixture(): Promise<MemberResendFixture> {
  let now = NOW;
  const fixture = await createOwnedTestApp({
    clock: () => {
      return new Date(now);
    },
  });
  const admin = await insertSignedInMember({
    database: fixture.database,
    member: { role: "admin" },
  });
  await insertInstanceSetting(fixture.database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  const invited = await fixture.app.inject({
    method: "POST",
    url: "/api/members",
    headers: { cookie: admin.cookie },
    payload: { email: "invitee@example.com", role: "viewer" },
  });
  const memberId: string = invited.json().memberId;
  const invitationId: string = invited.json().invitation.invitationId;
  return {
    ...fixture,
    admin,
    memberId,
    invitationId,
    setNow: (instant: string) => {
      now = instant;
    },
    resend: ({ targetId = memberId, cookie = admin.cookie } = {}) => {
      return fixture.app.inject({
        method: "POST",
        url: `/api/members/${targetId}/invitation/resend`,
        headers: cookie ? { cookie } : {},
      });
    },
  };
}

describe("member invitation resend", () => {
  it("preserves the invitation ID, extends seven days, increments persisted count and queues distinct frozen mail", async () => {
    const fixture = await _fixture();
    const resendAt = shiftDays({ instant: NOW, days: 2 });
    fixture.setNow(resendAt);
    const response = await fixture.resend();
    expect(response.statusCode).toBe(200);
    expect(response.json().invitation).toMatchObject({
      invitationId: fixture.invitationId,
      sendCount: 2,
      lastSentAt: resendAt,
      expiresAt: shiftDays({ instant: resendAt, days: 7 }),
      createdAt: NOW,
    });
    expect(
      await fixture.database.selectFrom("invitations").selectAll().execute(),
    ).toHaveLength(1);
    const queue = await fixture.database
      .selectFrom("outbound_emails")
      .selectAll()
      .orderBy("created_at")
      .execute();
    expect(
      queue.map((row) => {
        return row.idempotency_key;
      }),
    ).toEqual([
      `invite:${fixture.invitationId}:1`,
      `invite:${fixture.invitationId}:2`,
    ]);
    expect(JSON.parse(queue[1]?.payload_json ?? "null").expiresAt).toBe(
      shiftDays({ instant: resendAt, days: 7 }),
    );
    expect(
      await fixture.database
        .selectFrom("activity_events")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    expect(
      await fixture.database
        .selectFrom("settings")
        .selectAll()
        .where("key", "=", "visibility.generation")
        .execute(),
    ).toHaveLength(0);
    await fixture.close();
  });
  it("attaches the persisted minute/day middleware limits and refuses without changes", async () => {
    const fixture = await _fixture();
    expect((await fixture.resend()).statusCode).toBe(429);
    await [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce(
      async (previousSend, elapsedMinutes) => {
        await previousSend;
        fixture.setNow(shiftMinutes({ instant: NOW, minutes: elapsedMinutes }));
        expect((await fixture.resend()).statusCode).toBe(200);
      },
      Promise.resolve(),
    );
    fixture.setNow(shiftMinutes({ instant: NOW, minutes: 10 }));
    const daily = await fixture.resend();
    expect(daily.statusCode).toBe(429);
    expect(daily.json().details.retryAfterSeconds).toBeGreaterThan(0);
    expect(
      (
        await fixture.database
          .selectFrom("invitations")
          .select("send_count")
          .executeTakeFirstOrThrow()
      ).send_count,
    ).toBe(10);
    expect(
      await fixture.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toHaveLength(10);
    await fixture.close();
  });
  it.each(["active", "removed", "revoked", "accepted", "absent"])(
    "refuses %s invitation state",
    async (state) => {
      const fixture = await _fixture();
      fixture.setNow(shiftMinutes({ instant: NOW, minutes: 2 }));
      if (state === "active" || state === "removed") {
        await fixture.database
          .updateTable("members")
          .set({ status: state })
          .where("id", "=", fixture.memberId)
          .execute();
      }
      if (state === "revoked" || state === "accepted") {
        await fixture.database
          .updateTable("invitations")
          .set(state === "revoked" ? { revoked_at: NOW } : { accepted_at: NOW })
          .execute();
      }
      if (state === "absent") {
        await fixture.database.deleteFrom("invitations").execute();
      }
      const response = await fixture.resend();
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("invitations_not_pending");
      await fixture.close();
    },
  );
  it("does not add an expiry gate before the lapse job", async () => {
    const fixture = await _fixture();
    fixture.setNow(shiftDays({ instant: NOW, days: 8 }));
    expect((await fixture.resend()).statusCode).toBe(200);
    await fixture.close();
  });
  it("rolls back counters and expiry on enqueue failure", async () => {
    const fixture = await _fixture();
    fixture.setNow(shiftMinutes({ instant: NOW, minutes: 2 }));
    const before = await fixture.database
      .selectFrom("invitations")
      .selectAll()
      .execute();
    await sql`CREATE TRIGGER reject_resend BEFORE INSERT ON outbound_emails BEGIN SELECT RAISE(ABORT, 'forced enqueue failure'); END`.execute(
      fixture.database,
    );
    expect((await fixture.resend()).statusCode).toBe(500);
    expect(
      await fixture.database.selectFrom("invitations").selectAll().execute(),
    ).toEqual(before);
    await fixture.close();
  });
  it("preserves authorization errors before resend middleware for a freshly sent invitation", async () => {
    const fixture = await _fixture();
    const viewer = await insertSignedInMember({
      database: fixture.database,
      token: "viewer",
      member: { role: "viewer" },
    });
    expect(
      (
        await fixture.resend({
          targetId: fixture.memberId,
          cookie: viewer.cookie,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/members/${fixture.memberId}/invitation/resend`,
        })
      ).statusCode,
    ).toBe(401);
    await fixture.close();
  });
  it("uses role refusals, anonymous refusal and missing member errors", async () => {
    const fixture = await _fixture();
    fixture.setNow(shiftMinutes({ instant: NOW, minutes: 2 }));
    expect((await fixture.resend({ targetId: createId() })).json().error).toBe(
      "members_not_found",
    );
    const viewer = await insertSignedInMember({
      database: fixture.database,
      token: "viewer",
      member: { role: "viewer" },
    });
    expect(
      (
        await fixture.resend({
          targetId: fixture.memberId,
          cookie: viewer.cookie,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/members/${fixture.memberId}/invitation/resend`,
        })
      ).statusCode,
    ).toBe(401);
    const memberId = await insertMember(fixture.database, {
      status: "invited",
    });
    await insertInvitation(fixture.database, {
      memberId,
      invitedByMemberId: fixture.admin.memberId,
      last_sent_at: shiftDays({ instant: NOW, days: -1 }),
      revoked_at: NOW,
    });
    expect((await fixture.resend({ targetId: memberId })).json().error).toBe(
      "invitations_not_pending",
    );
    await fixture.close();
  });
});
