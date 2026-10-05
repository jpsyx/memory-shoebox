import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { createTestApp } from "../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../apps/server/test/helpers/createTestConfig.ts";
import { createSetupHttpsProxy } from "./createSetupHttpsProxy.ts";
import { makeSetupAssertionsFromPath } from "./makeSetupAssertionsFromPath.ts";

type SetupCatalog = {
  origin: string;
  assertions: ReturnType<typeof makeSetupAssertionsFromPath>;
};

/** Each test owns one migrated, unseeded file and one real loopback API/SPA. */
export const test = base.extend<{ catalog: SetupCatalog }>({
  catalog: async ({ browserName }, provideCatalog) => {
    void browserName;
    const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-"));
    const databasePath = join(directory, "catalog.db");
    const context = await createTestApp({
      database: createDatabase(databasePath),
      config: createTestConfig({
        NODE_ENV: "production",
        WEB_DIST_PATH: fileURLToPath(
          new URL("../../apps/web/dist", import.meta.url),
        ),
      }),
      emailService: "none",
      mailDomainReader: "none",
    });
    const assertions = makeSetupAssertionsFromPath(databasePath);
    let proxy: Awaited<ReturnType<typeof createSetupHttpsProxy>> | undefined;
    try {
      const address = await context.app.listen({ port: 0, host: "127.0.0.1" });
      expect(assertions.members()).toEqual([]);
      proxy = await createSetupHttpsProxy(directory, address);
      const origin = proxy.origin;
      await provideCatalog({ origin, assertions });
      expect(context.b2.calls).toEqual([]);
    } finally {
      await proxy?.close();
      assertions.close();
      await context.close();
      await rm(directory, { recursive: true });
    }
  },
  baseURL: async ({ catalog }, provideBaseUrl) => {
    await provideBaseUrl(catalog.origin);
  },
});
export { expect };
