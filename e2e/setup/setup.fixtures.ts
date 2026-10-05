import { test as base, expect } from "@playwright/test";
import { runSetupCatalog, type SetupCatalog } from "./runSetupCatalog.ts";

/** Each test owns one migrated, unseeded file and one real loopback API/SPA. */
export const test = base.extend<{ catalog: SetupCatalog }>({
  catalog: async ({ browserName }, provideCatalog) => {
    void browserName;
    await runSetupCatalog(provideCatalog);
  },
  baseURL: async ({ catalog }, provideBaseUrl) => {
    await provideBaseUrl(catalog.origin);
  },
});
export { expect };
