import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import type { ListMembersResponse } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { listMembersResponseSchema } from "@memory-shoebox/shared";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import {
  insertMember,
  insertSession,
  insertInvitation,
  NOW,
  shiftDays,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";

const VIEWER = {
  memberId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;

function _expectLatestMemberDirectoryFacts(
  options: Readonly<{
    payload: Extract<ListMembersResponse, { shape: "admin" }>;
    memberId: string;
    invitationId: string;
  }>,
): void {
  const { payload, memberId, invitationId } = options;
  expect(
    payload.members.find((member) => {
      return member.memberId === memberId;
    }),
  ).toEqual({
    memberId,
    displayName: "rosa",
    email: "rosa@example.com",
    role: "admin",
    status: "active",
    joinedAt: NOW,
    lastSignedInAt: NOW,
    lastSeenAt: NOW,
    removedAt: null,
    createdAt: NOW,
    invitation: {
      invitationId,
      invitedBy: { memberId, displayName: "rosa" },
      createdAt: NOW,
      expiresAt: shiftDays({ instant: NOW, days: 7 }),
      sendCount: 1,
      lastSentAt: NOW,
      revokedAt: null,
      acceptedAt: null,
      isPending: true,
    },
    sessions: [
      {
        sessionId: VIEWER.sessionId,
        deviceLabel: "A phone",
        createdAt: NOW,
        lastUsedAt: NOW,
        expiresAt: shiftDays({ instant: NOW, days: 30 }),
        isCurrent: true,
      },
    ],
    isLastActiveAdmin: true,
  });
}

describe("member directory", () => {
  it("returns batched admin facts, latest invitation and only live sessions", async () => {
    const fixture = await createOwnedTestApp({
      authenticate: async () => {
        return VIEWER;
      },
      clock: () => {
        return new Date(NOW);
      },
    });
    const { app, database, close } = fixture;
    const memberId = await insertMember(database, {
      id: VIEWER.memberId,
      role: "admin",
      display_name: null,
      email: "rosa@example.com",
    });
    await insertSession(database, { memberId, id: VIEWER.sessionId });
    await insertSession(database, { memberId, expires_at: NOW });
    await insertInvitation(database, {
      memberId,
      invitedByMemberId: memberId,
      id: "00000000-0000-4000-8000-000000000003",
      revoked_at: NOW,
    });
    const invitationId = await insertInvitation(database, {
      memberId,
      invitedByMemberId: memberId,
      id: "00000000-0000-4000-8000-000000000004",
    });
    await insertMember(database, { role: "admin", status: "invited" });
    await insertMember(database, { status: "removed" });
    const response = await app.inject("/api/members");
    expect(response.statusCode).toBe(200);
    const payload = listMembersResponseSchema.parse(response.json());
    expect(payload.shape).toBe("admin");
    if (payload.shape !== "admin") {
      throw new Error("Expected admin shape");
    }
    expect(payload.members).toHaveLength(2);
    expect(payload.activeAdminCount).toBe(1);
    _expectLatestMemberDirectoryFacts({ payload, memberId, invitationId });
    expect(
      (await app.inject("/api/members?status=removed")).json().members,
    ).toHaveLength(1);
    await close();
  });
  it.each(["viewer", "uploader"] as const)(
    "serves only refs to %s and refuses status filtering",
    async (role) => {
      const { app, database, close } = await createOwnedTestApp({
        authenticate: async () => {
          return { ...VIEWER, role, isAdmin: false };
        },
      });
      const memberId = await insertMember(database);
      await insertMember(database, { status: "removed" });
      const response = await app.inject("/api/members");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        shape: "directory",
        members: [{ memberId, displayName: "Abuela Rosa" }],
        nextCursor: null,
      });
      expect(response.json().members[0]).not.toHaveProperty("email");
      expect((await app.inject("/api/members?status=removed")).statusCode).toBe(
        403,
      );
      await close();
    },
  );
  it("keeps the same three read queries as the directory grows", async () => {
    const fixture = await createOwnedTestApp({
      authenticate: async () => {
        return VIEWER;
      },
      clock: () => {
        return new Date(NOW);
      },
    });
    const counted = makeQueryCountingDatabaseFromDatabase(fixture.database);
    fixture.app.database = counted.database;
    const memberId = await insertMember(fixture.database);
    await insertSession(fixture.database, { memberId });
    counted.reset();
    expect((await fixture.app.inject("/api/members")).statusCode).toBe(200);
    const smallCount = counted.getQueryCount();
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        const addedId = await insertMember(fixture.database);
        await insertSession(fixture.database, { memberId: addedId });
      }),
    );
    counted.reset();
    expect((await fixture.app.inject("/api/members")).statusCode).toBe(200);
    expect(counted.getQueryCount()).toBe(smallCount);
    expect(smallCount).toBe(3);
    await fixture.close();
  });
  it("requires authentication and rejects unknown or invalid filters", async () => {
    const anonymous = await createOwnedTestApp();
    expect((await anonymous.app.inject("/api/members")).statusCode).toBe(401);
    await anonymous.close();
    const fixture = await createOwnedTestApp({
      authenticate: async () => {
        return VIEWER;
      },
    });
    expect(
      (await fixture.app.inject("/api/members?status=owner")).statusCode,
    ).toBe(400);
    expect(
      (await fixture.app.inject("/api/members?shape=admin")).statusCode,
    ).toBe(400);
    await fixture.close();
  });
});
