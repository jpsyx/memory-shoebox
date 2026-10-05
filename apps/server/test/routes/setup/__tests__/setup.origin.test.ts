import type { LightMyRequestResponse } from "fastify";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createId } from "../../../../src/db/createId.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { createTestConfig } from "../../../helpers/createTestConfig.ts";
import { insertInstanceSetting } from "../../../helpers/seedHelpers/miscSeedHelpers.ts";
import { BODY, NOW } from "./setupTestHelpers.ts";

async function _expectSetupRateLimitCatalog(
  options: Readonly<{ limited: LightMyRequestResponse; context: TestApp }>,
): Promise<void> {
  const { limited, context } = options;
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
}

describe("first-run setup", () => {
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
      await _expectSetupRateLimitCatalog({ limited, context });
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
