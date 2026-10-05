import {
  test as base,
  expect,
  type TestType,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
} from "@playwright/test";
import {
  runSetupCatalog,
  type SetupCatalog,
} from "../runSetupCatalog/runSetupCatalog.ts";

/** Each test owns one migrated, unseeded file and one real loopback API/SPA. */
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & { catalog: SetupCatalog },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = base.extend<{ catalog: SetupCatalog }>({
  catalog: async ({ browserName }, provideCatalog) => {
    void browserName;
    await runSetupCatalog(provideCatalog);
  },
  baseURL: async ({ catalog }, provideBaseUrl) => {
    await provideBaseUrl(catalog.origin);
  },
});
export { expect };
