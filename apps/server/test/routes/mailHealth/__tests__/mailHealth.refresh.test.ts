import { describe, expect, it } from "vitest";
import {
  ADMIN,
  createConfiguredMailHealthApp,
} from "../../../helpers/createConfiguredMailHealthApp.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import { insertInstanceSetting } from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/mail/health refresh", () => {
  it("forwards true, false and omitted refresh flags to the domain reader", async () => {
    const testApp = await createOwnedTestApp({
      authenticate: async () => {
        return ADMIN;
      },
      mailDomainReader: async (_domain, refresh) => {
        return {
          isVerified: refresh === true,
          error: undefined,
        };
      },
    });
    await insertInstanceSetting(testApp.database, {
      key: "public.base_url",
      value: "https://family.example",
    });
    await insertInstanceSetting(testApp.database, {
      key: "mail.from_address",
      value: "family@example.com",
    });
    expect(
      (await testApp.app.inject("/api/mail/health")).json().domainVerifiedAt,
    ).toBeNull();
    expect(
      (await testApp.app.inject("/api/mail/health?refresh=true")).json()
        .domainVerifiedAt,
    ).toEqual(expect.any(String));
    expect(
      (await testApp.app.inject("/api/mail/health?refresh=false")).json()
        .domainVerifiedAt,
    ).toBeNull();
    await testApp.close();
  });

  it.each(["1", "bad"])("rejects invalid refresh query %s", async (refresh) => {
    const { app, close } = await createConfiguredMailHealthApp();
    expect(
      (await app.inject(`/api/mail/health?refresh=${refresh}`)).statusCode,
    ).toBe(400);
    await close();
  });

  it.each([false, true])(
    "discards provider results when the sender domain changes during refresh=%s",
    async (refresh) => {
      const testApp = await createOwnedTestApp({
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
      const health = (
        await testApp.app.inject(`/api/mail/health?refresh=${refresh}`)
      ).json();
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
    },
  );
});
