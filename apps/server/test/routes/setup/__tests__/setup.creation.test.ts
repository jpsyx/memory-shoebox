import { createSetupResponseSchema } from "@memory-shoebox/shared";
import type { LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { makeTokenHashFromToken } from "../../../../src/auth/sessionToken.ts";
import type { Database } from "../../../../src/db/types/db.types.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertMember } from "../../../helpers/seedHelpers/memberSeedHelpers.ts";
import { BODY, NOW } from "./setupTestHelpers.ts";

function _expectCreatedAdminResponse(
  options: Readonly<{ created: LightMyRequestResponse }>,
): void {
  const { created } = options;
  expect(created.statusCode).toBe(201);
  expect(created.json().me.role).toBe("admin");
  expect(created.headers["set-cookie"]).toContain(
    "HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
  );
  expect(created.json()).not.toHaveProperty("token");
  expect(createSetupResponseSchema.parse(created.json())).toMatchObject({
    me: {
      storedDisplayName: "Rosa",
      email: "rosa@example.com",
      role: "admin",
      joinedAt: NOW,
      lastSignedInAt: NOW,
      notify: {
        onUpload: true,
        onComment: true,
        onReply: true,
        onRemoval: true,
      },
    },
    isFirstSignIn: true,
    settings: {
      shoeboxName: "Rosa's Shoebox",
      pileArrangement: "messy",
      timezone: "America/New_York",
    },
    session: {
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: "2026-11-03T12:00:00.000Z",
      isCurrent: true,
    },
  });
}

async function _expectInitialAdminCatalog(
  options: Readonly<{ members: Array<Database["members"]>; context: TestApp }>,
): Promise<void> {
  const { members, context } = options;
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({
    status: "active",
    role: "admin",
    joined_at: NOW,
    last_signed_in_at: NOW,
    removed_at: null,
  });
  expect(
    await context.database.selectFrom("invitations").selectAll().execute(),
  ).toEqual([]);
  expect(
    await context.database.selectFrom("outbound_emails").selectAll().execute(),
  ).toEqual([]);
}

type ExpectRejectedSetupReplayOptions = {
  replayed: LightMyRequestResponse;
  context: TestApp;
  settingsBefore: Array<Database["settings"]>;
  auditBefore: Array<Database["activity_events"]>;
};

async function _expectRejectedSetupReplay(
  options: Readonly<ExpectRejectedSetupReplayOptions>,
): Promise<void> {
  const { replayed, context, settingsBefore, auditBefore } = options;
  expect(replayed.statusCode).toBe(409);
  expect(replayed.json().error).toBe("setup_already_completed");
  expect(replayed.json()).not.toHaveProperty("details");
  expect(replayed.headers["set-cookie"]).toBeUndefined();
  expect(
    await context.database
      .selectFrom("settings")
      .selectAll()
      .orderBy("key")
      .execute(),
  ).toEqual(settingsBefore);
  expect(
    await context.database.selectFrom("activity_events").selectAll().execute(),
  ).toEqual(auditBefore);
  expect(
    await context.database.selectFrom("members").selectAll().execute(),
  ).toHaveLength(1);
  expect(
    await context.database.selectFrom("sessions").selectAll().execute(),
  ).toHaveLength(1);
}

async function _getSetupEvidenceFromResponse(
  options: Readonly<{
    context: TestApp;
    created: LightMyRequestResponse;
    memberId: string;
  }>,
): Promise<{
  cookie: string;
  settingsBefore: Array<Database["settings"]>;
  auditBefore: Array<Database["activity_events"]>;
}> {
  const { context, created, memberId } = options;
  const cookie = String(created.headers["set-cookie"]).split(";")[0]!;
  const token = cookie.split("=")[1]!;
  const sessions = await context.database
    .selectFrom("sessions")
    .selectAll()
    .execute();
  expect(sessions).toHaveLength(1);
  expect(sessions[0]!.token_hash).toBe(makeTokenHashFromToken(token));
  expect(sessions[0]!.token_hash).not.toBe(token);
  const settingsBefore = await context.database
    .selectFrom("settings")
    .selectAll()
    .orderBy("key")
    .execute();
  const auditBefore = await context.database
    .selectFrom("activity_events")
    .selectAll()
    .execute();
  expect(auditBefore.length).toBeGreaterThan(0);
  expect(
    auditBefore.every((event) => {
      return (
        event.actor_member_id === memberId &&
        event.device_id === sessions[0]!.id
      );
    }),
  ).toBe(true);
  return { cookie, settingsBefore, auditBefore };
}

async function _prepareInitialSetupEvidence(
  options: Readonly<{ context: TestApp }>,
): Promise<{ homeSessionRead: LightMyRequestResponse; cookie: string }> {
  const { context } = options;
  const initialStatus = await context.app.inject({ url: "/api/setup" });
  expect(initialStatus.statusCode).toBe(200);
  expect(initialStatus.json()).toEqual({ isRequired: true });
  expect(initialStatus.headers["cache-control"]).toBe("no-store");
  const created = await context.app.inject({
    method: "POST",
    url: "/api/setup",
    payload: BODY,
  });
  _expectCreatedAdminResponse({ created });
  const members = await context.database
    .selectFrom("members")
    .selectAll()
    .execute();
  await _expectInitialAdminCatalog({ members, context });
  const { cookie, settingsBefore, auditBefore } =
    await _getSetupEvidenceFromResponse({
      context,
      created,
      memberId: members[0]!.id,
    });
  const replayed = await context.app.inject({
    method: "POST",
    url: "/api/setup",
    payload: { ...BODY, shoebox: { ...BODY.shoebox, name: "Attacker" } },
  });
  await _expectRejectedSetupReplay({
    replayed,
    context,
    settingsBefore,
    auditBefore,
  });
  const homeSessionRead = await context.app.inject({
    url: "/api/me",
    headers: { cookie },
  });
  return { homeSessionRead, cookie };
}

describe("first-run setup", () => {
  it("creates one active admin, settings, audit and a usable hashed-token session", async () => {
    const context = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
      emailService: "none",
      mailDomainReader: "none",
    });
    try {
      const { homeSessionRead, cookie } = await _prepareInitialSetupEvidence({
        context,
      });
      expect(homeSessionRead.statusCode).toBe(200);
      const progress = await context.app.inject({
        url: "/api/setup/progress",
        headers: { cookie },
      });
      expect(progress.statusCode).toBe(200);
      expect(progress.headers["cache-control"]).toBe("no-store");
      expect(progress.json()).toEqual({ needsInvitations: true });
      expect((await context.app.inject({ url: "/api/setup" })).json()).toEqual({
        isRequired: false,
      });
    } finally {
      await context.close();
    }
  });

  it.each(["invited", "removed", "active"])(
    "closes creation when an %s member exists",
    async (status) => {
      const context = await createTestApp();
      try {
        await insertMember(context.database, { status });
        expect(
          (await context.app.inject({ url: "/api/setup" })).json(),
        ).toEqual({ isRequired: false });
        const refused = await context.app.inject({
          method: "POST",
          url: "/api/setup",
          payload: BODY,
        });
        expect(refused.statusCode).toBe(409);
        expect(refused.json().error).toBe("setup_already_completed");
        expect(
          await context.database.selectFrom("settings").selectAll().execute(),
        ).toEqual([]);
        expect(
          await context.database.selectFrom("sessions").selectAll().execute(),
        ).toEqual([]);
      } finally {
        await context.close();
      }
    },
  );

  it("leaves sender identity unset when optional mail is omitted", async () => {
    const context = await createTestApp();
    try {
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup",
            payload: BODY,
          })
        ).statusCode,
      ).toBe(201);
      const mail = await context.database
        .selectFrom("settings")
        .select(["key", "value"])
        .where("key", "in", ["mail.from_address", "mail.from_name"])
        .execute();
      expect(
        mail.map((row) => {
          return JSON.parse(row.value);
        }),
      ).toEqual([null, null]);
    } finally {
      await context.close();
    }
  });

  it.each(["/api/setup/progress", "/api/setup/complete"])(
    "requires an active admin on %s",
    async (url) => {
      const context = await createTestApp();
      try {
        const method = url.endsWith("complete") ? "POST" : "GET";
        expect((await context.app.inject({ method, url })).statusCode).toBe(
          401,
        );
        const viewer = await insertSignedInMember({
          database: context.database,
          member: { role: "viewer" },
        });
        const refused = await context.app.inject({
          method,
          url,
          headers: { cookie: viewer.cookie },
        });
        expect(refused.statusCode).toBe(403);
        expect(refused.json().error).toBe("setup_forbidden");
        const removed = await insertSignedInMember({
          database: context.database,
          token: "removed",
          member: { role: "admin", status: "removed" },
        });
        expect(
          (
            await context.app.inject({
              method,
              url,
              headers: { cookie: removed.cookie },
            })
          ).statusCode,
        ).toBe(401);
      } finally {
        await context.close();
      }
    },
  );

  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "application/octet-stream",
  ])("requires JSON rather than %s", async (contentType) => {
    const context = await createTestApp();
    try {
      const refused = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        headers: { "content-type": contentType },
        payload: JSON.stringify(BODY),
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json().error).toBe("invalid_request");
    } finally {
      await context.close();
    }
  });

  it.each([undefined, "http://localhost"])(
    "accepts absent or same serving Origin %s and an independently editable public URL",
    async (origin) => {
      const context = await createTestApp();
      try {
        expect(
          (
            await context.app.inject({
              method: "POST",
              url: "/api/setup",
              headers: origin === undefined ? {} : { origin },
              payload: BODY,
            })
          ).statusCode,
        ).toBe(201);
      } finally {
        await context.close();
      }
    },
  );

  it.each([
    {
      admin: { displayName: "Rosa", email: "rosa@example.com", role: "admin" },
    },
    { shoebox: { name: "Shoebox", timezone: "Invalid/Zone" } },
    { public: { baseUrl: "javascript:alert(1)" } },
    { pendingMemberId: "unsafe" },
  ])("rejects invalid and unknown creation fields %j", async (override) => {
    const context = await createTestApp();
    try {
      const refused = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        payload: { ...BODY, ...override },
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json().error).toBe("invalid_request");
      expect(
        await context.database.selectFrom("members").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
