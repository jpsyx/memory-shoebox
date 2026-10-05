import { test as base, expect } from "@playwright/test";
import { createAcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";

/** Every scenario owns its catalog, sessions, fake objects and production SPA. */
export const test = base.extend<{
  catalog: Awaited<ReturnType<typeof createAcceptanceCatalog>>;
}>({
  catalog: async ({ browserName }, provide, testInfo) => {
    void browserName;
    const webDistDirectory =
      testInfo.config.metadata.adminWebDistDirectory === "dist-e2e"
        ? "dist-e2e"
        : "dist";
    const catalog = await createAcceptanceCatalog(0, false, webDistDirectory);
    try {
      await provide(catalog);
    } finally {
      await catalog.close();
    }
  },
  baseURL: async ({ catalog }, provide) => {
    await provide(catalog.origin);
  },
});
export { expect };
