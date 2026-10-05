import { insertSession } from "../../apps/server/test/helpers/seedHelpers/memberSeedHelpers.ts";
import { makeTokenHashFromToken } from "../../apps/server/src/auth/sessionToken.ts";
import { test as base, expect, type Page } from "@playwright/test";
import { createAcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";

/**
 * Every scenario owns its catalog, sessions, fake objects and production SPA.
 */
export const test = base.extend<{
  catalog: Awaited<ReturnType<typeof createAcceptanceCatalog>>;
  otherAdminPage: Page;
}>({
  catalog: async ({ browserName }, provide, testInfo) => {
    void browserName;
    const webDistDirectory =
      testInfo.config.metadata.adminWebDistDirectory === "dist-e2e"
        ? "dist-e2e"
        : "dist";
    const catalog = await createAcceptanceCatalog({
      port: 0,
      isEmpty: false,
      webDistDirectory,
    });
    try {
      await provide(catalog);
    } finally {
      await catalog.close();
    }
  },
  otherAdminPage: async ({ browser, catalog }, provide) => {
    const token = "concurrent-admin-session";
    await insertSession(catalog.database, {
      memberId: catalog.secondAdmin,
      token_hash: makeTokenHashFromToken(token),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const context = await browser.newContext({ baseURL: catalog.origin });
    try {
      await context.addCookies([
        {
          name: "shoebox_session",
          value: token,
          url: catalog.origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await provide(await context.newPage());
    } finally {
      await context.close();
    }
  },
  baseURL: async ({ catalog }, provide) => {
    await provide(catalog.origin);
  },
});
/** The shared Playwright assertions used by administrative scenarios. */
export { expect };
