import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createSetupResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers/miscSeedHelpers.ts";
import { createId } from "../../src/db/createId.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";

const NOW = "2026-10-04T12:00:00.000Z";
const BODY = {
  admin: { displayName: "  Rosa  ", email: " ROSA@Example.com " },
  shoebox: { name: "Rosa's Shoebox", timezone: "America/New_York" },
  public: { baseUrl: "https://photos.example.com" },
};

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
      const initialStatus = await context.app.inject({ url: "/api/setup" });
      expect(initialStatus.statusCode).toBe(200);
      expect(initialStatus.json()).toEqual({ isRequired: true });
      expect(initialStatus.headers["cache-control"]).toBe("no-store");
      const created = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        payload: BODY,
      });
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
      const members = await context.database
        .selectFrom("members")
        .selectAll()
        .execute();
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
        await context.database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute(),
      ).toEqual([]);
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
            event.actor_member_id === members[0]!.id &&
            event.device_id === sessions[0]!.id
          );
        }),
      ).toBe(true);
      const replayed = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        payload: { ...BODY, shoebox: { ...BODY.shoebox, name: "Attacker" } },
      });
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
        await context.database
          .selectFrom("activity_events")
          .selectAll()
          .execute(),
      ).toEqual(auditBefore);
      expect(
        await context.database.selectFrom("members").selectAll().execute(),
      ).toHaveLength(1);
      expect(
        await context.database.selectFrom("sessions").selectAll().execute(),
      ).toHaveLength(1);
      const homeSessionRead = await context.app.inject({
        url: "/api/me",
        headers: { cookie },
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

  it("keeps setup available with settings and unknown-address codes only", async () => {
    const context = await createTestApp();
    try {
      await insertInstanceSetting(context.database, {
        key: "shoebox.name",
        value: "Old name",
      });
      await insertInstanceSetting(context.database, {
        key: "pile.arrangement",
        value: "neat",
      });
      await context.database
        .insertInto("sign_in_codes")
        .values({
          id: createId(),
          email: "unknown@example.com",
          member_id: null,
          code_hash: "placeholder",
          attempts: 0,
          max_attempts: 3,
          expires_at: "2026-11-01T00:00:00.000Z",
          consumed_at: null,
          invalidated_at: null,
          created_at: NOW,
        })
        .execute();
      expect((await context.app.inject({ url: "/api/setup" })).json()).toEqual({
        isRequired: true,
      });
      const created = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        payload: BODY,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().settings.pileArrangement).toBe("messy");
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

  it.each([null, "From Rosa"])(
    "defaults sender name only when sender address is supplied (%s)",
    async (fromName) => {
      const context = await createTestApp();
      try {
        expect(
          (
            await context.app.inject({
              method: "POST",
              url: "/api/setup",
              payload: {
                ...BODY,
                mail: { fromAddress: "family@example.com", fromName },
              },
            })
          ).statusCode,
        ).toBe(201);
        const setting = await context.database
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "mail.from_name")
          .executeTakeFirstOrThrow();
        expect(JSON.parse(setting.value)).toBe(fromName ?? "Rosa's Shoebox");
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

  it("lets any active admin complete progress idempotently while only its named admin resumes", async () => {
    const context = await createTestApp();
    try {
      const owner = await insertSignedInMember({
        database: context.database,
        token: "owner",
        member: { role: "admin" },
      });
      const other = await insertSignedInMember({
        database: context.database,
        token: "other",
        member: { role: "admin" },
      });
      await insertInstanceSetting(context.database, {
        key: "setup.pending_member_id",
        value: owner.memberId,
      });
      expect(
        (
          await context.app.inject({
            url: "/api/setup/progress",
            headers: { cookie: owner.cookie },
          })
        ).json(),
      ).toEqual({ needsInvitations: true });
      expect(
        (
          await context.app.inject({
            url: "/api/setup/progress",
            headers: { cookie: other.cookie },
          })
        ).json(),
      ).toEqual({ needsInvitations: false });
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup/complete",
            headers: { cookie: other.cookie },
          })
        ).statusCode,
      ).toBe(204);
      const stored = await context.database
        .selectFrom("settings")
        .selectAll()
        .where("key", "=", "setup.pending_member_id")
        .executeTakeFirstOrThrow();
      expect(stored.value).toBe("null");
      expect(stored.updated_by_member_id).toBe(other.memberId);
      const events = await context.database
        .selectFrom("activity_events")
        .selectAll()
        .execute();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "setting_changed",
        subject_id: "setup.pending_member_id",
        actor_member_id: other.memberId,
      });
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup/complete",
            headers: { cookie: other.cookie },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        await context.database
          .selectFrom("activity_events")
          .selectAll()
          .execute(),
      ).toEqual(events);
      expect(
        (
          await context.app.inject({
            url: "/api/setup/progress",
            headers: { cookie: owner.cookie },
          })
        ).json(),
      ).toEqual({ needsInvitations: false });
    } finally {
      await context.close();
    }
  });

  it("treats existing members without progress as already configured", async () => {
    const context = await createTestApp();
    try {
      const admin = await insertSignedInMember({
        database: context.database,
        member: { role: "admin" },
      });
      expect(
        (
          await context.app.inject({
            url: "/api/setup/progress",
            headers: { cookie: admin.cookie },
          })
        ).json(),
      ).toEqual({ needsInvitations: false });
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup/complete",
            headers: { cookie: admin.cookie },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        await context.database.selectFrom("settings").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it.each([
    "null",
    "garbage",
    "https://evil.example",
    "http://localhost/path",
    "http://localhost/",
    "http://user@localhost",
    "http://localhost?query=1",
  ])(
    "rejects malformed or cross-origin Origin %s without trusting submitted URL",
    async (origin) => {
      const context = await createTestApp();
      try {
        const refused = await context.app.inject({
          method: "POST",
          url: "/api/setup",
          headers: { origin },
          payload: { ...BODY, public: { baseUrl: "https://evil.example" } },
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().error).toBe("invalid_request");
        expect(refused.headers["set-cookie"]).toBeUndefined();
        expect(
          await context.database.selectFrom("members").selectAll().execute(),
        ).toEqual([]);
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

  it("uses only the trusted nearest proxy host and protocol in production", async () => {
    const context = await createTestApp({
      config: createTestConfig({ NODE_ENV: "production" }),
    });
    try {
      const created = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        headers: {
          host: "internal:8080",
          "x-forwarded-host": "spoof.example, photos.example.com:8443",
          "x-forwarded-proto": "http, https",
          origin: "https://photos.example.com:8443",
        },
        payload: BODY,
      });
      expect(created.statusCode).toBe(201);
    } finally {
      await context.close();
    }
  });

  it("ignores spoofed forwarding headers without a trusted proxy", async () => {
    const context = await createTestApp();
    try {
      const refused = await context.app.inject({
        method: "POST",
        url: "/api/setup",
        headers: {
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
          origin: "https://evil.example",
        },
        payload: BODY,
      });
      expect(refused.statusCode).toBe(400);
    } finally {
      await context.close();
    }
  });

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

  it("counts the twentieth attempt and refuses the twenty-first without input, IP or token logs", async () => {
    const logs: string[] = [];
    const stream = new Writable({
      write: (chunk, _encoding, callback) => {
        logs.push(String(chunk));
        callback();
      },
    });
    const context = await createTestApp({
      logger: { stream },
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const send = () => {
        return context.app.inject({
          method: "POST",
          url: "/api/setup",
          remoteAddress: "203.0.113.71",
          payload: BODY,
        });
      };
      const created = await send();
      expect(created.statusCode).toBe(201);
      await Array.from({ length: 19 }).reduce(async (previousAttempt) => {
        await previousAttempt;
        expect((await send()).statusCode).toBe(409);
      }, Promise.resolve());
      const limited = await send();
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({
        error: "rate_limited",
        details: { retryAfterSeconds: 3600 },
      });
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup",
            remoteAddress: "203.0.113.72",
            payload: BODY,
          })
        ).statusCode,
      ).toBe(409);
      const token = String(created.headers["set-cookie"])
        .split(";")[0]!
        .split("=")[1]!;
      expect(logs.join(" ")).not.toMatch(
        /203\.0\.113\.|rosa@example\.com|ROSA@Example\.com|Rosa's Shoebox|photos\.example\.com/,
      );
      expect(logs.join(" ")).not.toContain(token);
      expect(logs.join(" ")).not.toContain(context.config.signInCodePepper);
    } finally {
      await context.close();
    }
  });
});
