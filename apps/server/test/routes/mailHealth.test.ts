import { describe, expect, it } from "vitest";
import { mailHealthResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";
import {
  NOW,
  insertInstanceSetting,
  insertOutboundEmail,
  shiftDays,
} from "../helpers/seedHelpers/seedHelpers.ts";

const ADMIN = {
  memberId: "admin",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const;

async function _configuredApp() {
  const testApp = await createTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
    mailDomainReader: async () => {
      return { isVerified: true, error: undefined };
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://family.example.com",
  });
  await insertInstanceSetting(testApp.database, {
    key: "mail.from_address",
    value: "photos@example.com",
  });
  return testApp;
}

describe("GET /api/mail/health", () => {
  it("prioritizes base URL then sender on a fresh instance", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
    });
    const response = await app.inject("/api/mail/health");
    expect(response.statusCode).toBe(200);
    expect(response.json().diagnosis.code).toBe("base_url_unset");
    expect(response.json().status).toBe("failing");
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    expect((await app.inject("/api/mail/health")).json().diagnosis.code).toBe(
      "from_address_unset",
    );
    await close();
  });

  it("does not trust stored verification when the provider is unconfigured", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "photos@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.domain_verified_at",
      value: NOW,
    });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis.code).toBe("domain_unverified");
    expect(health.domainVerifiedAt).toBe(NOW);
    expect(health.domainLastCheckError).toBeNull();
    expect(health.diagnosis.providerError).toBeTruthy();
    await close();
  });

  it("records a successful real-source domain check and reports healthy empty mail", async () => {
    const { app, database, close } = await _configuredApp();
    const response = await app.inject("/api/mail/health");
    expect(response.statusCode).toBe(200);
    const health = mailHealthResponseSchema.parse(response.json());
    expect(health.status).toBe("ok");
    expect(health.diagnosis).toBeNull();
    expect(health.domainVerifiedAt).toBe(NOW);
    expect(health.sendingDomain).toBe("example.com");
    const facts = await database
      .selectFrom("settings")
      .select(["key", "value"])
      .where("key", "like", "mail.domain_%")
      .execute();
    expect(facts).toEqual(
      expect.arrayContaining([
        { key: "mail.domain_verified_at", value: JSON.stringify(NOW) },
        { key: "mail.domain_last_check_error", value: "null" },
      ]),
    );
    await close();
  });

  it.each([false, true])(
    "reports provider refusal with partly-sending=%s and safe queue facts",
    async (hasRecentSent) => {
      const { app, database, close } = await _configuredApp();
      await insertOutboundEmail(database, {
        state: "failed",
        last_error_code: "403",
        last_error_message: "Provider refusing sender",
      });
      await insertOutboundEmail(database, { state: "queued" });
      await insertOutboundEmail(database, {
        state: "sent",
        sent_at: hasRecentSent ? NOW : shiftDays({ instant: NOW, days: -2 }),
      });
      await insertOutboundEmail(database, { state: "suppressed" });
      await database
        .insertInto("email_suppressions")
        .values([
          {
            id: "active",
            address: "hidden@example.com",
            reason: "complaint",
            created_at: NOW,
            cleared_at: null,
          },
          {
            id: "cleared",
            address: "gone@example.com",
            reason: "bounce",
            created_at: NOW,
            cleared_at: NOW,
          },
        ])
        .execute();
      const response = await app.inject("/api/mail/health");
      const health = mailHealthResponseSchema.parse(response.json());
      expect(health.status).toBe(hasRecentSent ? "degraded" : "failing");
      expect(health.diagnosis).toEqual({
        code: "provider_rejecting",
        providerStatus: "403",
        providerMessage: "The mail provider refused this delivery.",
        failingSince: NOW,
      });
      expect(health.lastError).toEqual({
        code: "403",
        message: "The mail provider refused this delivery.",
        occurredAt: NOW,
        kind: "sign_in_code",
      });
      expect(health.suppressedAddressCount).toBe(1);
      expect(health.queue.suppressedCount).toBe(1);
      expect(response.payload).not.toContain("410233");
      expect(response.payload).not.toContain("hidden@example.com");
      expect(response.payload).not.toContain("payload_json");
      await close();
    },
  );

  it("reports queued backlog only after configuration and verification", async () => {
    const { app, database, close } = await _configuredApp();
    await insertOutboundEmail(database);
    expect((await app.inject("/api/mail/health")).json().diagnosis).toEqual({
      code: "backlog",
      oldestQueuedAt: NOW,
      queuedCount: 1,
    });
    await close();
  });

  it("refuses unverified domains even with old verified facts", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
      mailDomainReader: async () => {
        return { isVerified: false, error: undefined };
      },
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "photos@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.domain_verified_at",
      value: NOW,
    });
    expect((await app.inject("/api/mail/health")).json().diagnosis.code).toBe(
      "domain_unverified",
    );
    expect(
      JSON.parse(
        (
          await database
            .selectFrom("settings")
            .select("value")
            .where("key", "=", "mail.domain_verified_at")
            .executeTakeFirstOrThrow()
        ).value,
      ),
    ).toBeNull();
    await close();
  });

  it("records sanitized check errors while preserving the last verified fact", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
      mailDomainReader: async () => {
        return {
          isVerified: false,
          error: "Unable to read provider domains.",
        };
      },
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "photos@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.domain_verified_at",
      value: NOW,
    });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis.code).toBe("domain_unverified");
    expect(health.domainVerifiedAt).toBe(NOW);
    expect(health.domainLastCheckError).toBe(
      "Unable to read provider domains.",
    );
    expect(
      (
        await database
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "mail.domain_last_check_error")
          .executeTakeFirstOrThrow()
      ).value,
    ).toBe(JSON.stringify("Unable to read provider domains."));
    await close();
  });

  it("discards provider results when the sender domain changes during the read", async () => {
    const testApp = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
      mailDomainReader: async () => {
        await testApp.database
          .updateTable("settings")
          .set({ value: JSON.stringify("photos@other.com") })
          .where("key", "=", "mail.from_address")
          .execute();
        return { isVerified: true, error: undefined };
      },
    });
    await insertInstanceSetting(testApp.database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    await insertInstanceSetting(testApp.database, {
      key: "mail.from_address",
      value: "photos@example.com",
    });
    const health = (await testApp.app.inject("/api/mail/health")).json();
    expect(health.sendingDomain).toBe("other.com");
    expect(health.domainVerifiedAt).toBeNull();
    expect(health.diagnosis.code).toBe("domain_unverified");
    expect(
      await testApp.database
        .selectFrom("settings")
        .select("id")
        .where("key", "like", "mail.domain_%")
        .execute(),
    ).toEqual([]);
    await testApp.close();
  });

  it("keeps old terminal failures as history after recent mail succeeds", async () => {
    const { app, database, close } = await _configuredApp();
    const oldInstant = shiftDays({ instant: NOW, days: -2 });
    await insertOutboundEmail(database, {
      state: "failed",
      created_at: oldInstant,
      last_error_code: "403",
      last_error_message: "Provider refused sender",
    });
    await insertOutboundEmail(database, { state: "sent", sent_at: NOW });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis).toBeNull();
    expect(health.status).toBe("ok");
    expect(health.lastError.occurredAt).toBe(oldInstant);
    expect(health.queue.failedCount).toBe(1);
    await close();
  });

  it.each([
    "base_url_unset",
    "from_address_unset",
    "provider_unconfigured",
    "no_template",
    "render_failed",
    "address_suppressed",
  ])(
    "does not blame the provider for retained internal failure %s",
    async (errorCode) => {
      const { app, database, close } = await _configuredApp();
      await insertOutboundEmail(database, {
        state: "failed",
        last_error_code: errorCode,
      });
      const health = (await app.inject("/api/mail/health")).json();
      expect(health.diagnosis).toBeNull();
      expect(health.lastError.code).toBe(errorCode);
      expect(health.queue.failedCount).toBe(1);
      await close();
    },
  );

  it("keeps old queued provider retries actionable beside a newer internal failure", async () => {
    const { app, database, close } = await _configuredApp();
    await insertOutboundEmail(database, {
      state: "queued",
      created_at: shiftDays({ instant: NOW, days: -3 }),
      last_error_code: "429",
      last_error_message: "Provider rate limited",
    });
    await insertOutboundEmail(database, {
      state: "failed",
      last_error_code: "base_url_unset",
    });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis.code).toBe("provider_rejecting");
    expect(health.diagnosis.providerStatus).toBe("429");
    expect(health.lastError.code).toBe("base_url_unset");
    await close();
  });

  it("includes a failed record with no provider fields as the latest failure", async () => {
    const { app, database, close } = await _configuredApp();
    await insertOutboundEmail(database, { state: "failed" });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.lastError).toEqual({
      code: null,
      message: null,
      occurredAt: NOW,
      kind: "sign_in_code",
    });
    expect(health.diagnosis.code).toBe("provider_rejecting");
    await close();
  });

  it("prioritizes provider verification refusals over other delivery failures", async () => {
    const { app, database, close } = await _configuredApp();
    await insertOutboundEmail(database, {
      state: "queued",
      last_error_code: "validation_error",
      last_error_message: "Sender domain is not verified",
    });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis.code).toBe("domain_unverified");
    expect(health.queue.queuedCount).toBe(1);
    await close();
  });

  it.each(["viewer", "uploader"] as const)(
    "refuses %s without returning configuration",
    async (role) => {
      const { app, close } = await createTestApp({
        authenticate: async () => {
          return { ...ADMIN, role, isAdmin: false };
        },
      });
      const response = await app.inject("/api/mail/health");
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("mail_forbidden");
      await close();
    },
  );

  it("requires a session", async () => {
    const { app, close } = await createTestApp();
    expect((await app.inject("/api/mail/health")).statusCode).toBe(401);
    await close();
  });

  it("does not read a real provider or fabricate verification in fake mode", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
      config: createTestConfig({
        RESEND_API_KEY: "never-contact-provider",
        ENABLE_FAKE_EMAIL: "true",
      }),
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "photos@example.com",
    });
    expect(
      (await app.inject("/api/mail/health")).json().domainVerifiedAt,
    ).toBeNull();
    expect(
      await database
        .selectFrom("settings")
        .select("id")
        .where("key", "like", "mail.domain_%")
        .execute(),
    ).toEqual([]);
    await close();
  });
});
