import { deepStrictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../../../apps/server/src/db/client.ts";
import {
  createTestApp,
  type TestApp,
} from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { createSetupHttpsProxy } from "./createSetupHttpsProxy.ts";
import { makeSetupAssertionsFromPath } from "./makeSetupAssertionsFromPath.ts";

/** The origin and read-only facts from one test-owned catalog. */
export type SetupCatalog = {
  origin: string;
  assertions: ReturnType<typeof makeSetupAssertionsFromPath>;
};
type SetupResources = {
  database?: ReturnType<typeof createDatabase>;
  context?: TestApp;
  assertions?: SetupCatalog["assertions"];
  proxy?: Awaited<ReturnType<typeof createSetupHttpsProxy>>;
};

async function _closeSetupResources(options: {
  directory: string;
  resources: SetupResources;
}): Promise<void> {
  const { resources, directory } = options;
  try {
    await resources.proxy?.close();
  } finally {
    try {
      resources.assertions?.close();
    } finally {
      try {
        await resources.context?.app.close();
      } finally {
        try {
          await resources.database?.destroy();
        } finally {
          await rm(directory, { recursive: true });
        }
      }
    }
  }
}

/** Own one fresh catalog and its API, assertion handle and HTTPS proxy. */
export async function runSetupCatalog(
  provideCatalog: (catalog: Readonly<SetupCatalog>) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-"));
  const resources: SetupResources = {};
  try {
    const databasePath = join(directory, "catalog.db");
    // The fixture retains ownership even if createTestApp rejects.
    resources.database = createDatabase(databasePath);
    resources.context = await createTestApp({
      database: resources.database,
      config: createTestConfig({
        NODE_ENV: "production",
        WEB_DIST_PATH: fileURLToPath(
          new URL("../../../apps/web/dist", import.meta.url),
        ),
      }),
      emailService: "none",
      mailDomainReader: "none",
    });
    resources.assertions = makeSetupAssertionsFromPath(databasePath);
    const address = await resources.context.app.listen({
      port: 0,
      host: "127.0.0.1",
    });
    deepStrictEqual(resources.assertions.members(), []);
    resources.proxy = await createSetupHttpsProxy({
      directory,
      upstream: address,
    });
    await provideCatalog({
      origin: resources.proxy.origin,
      assertions: resources.assertions,
    });
    deepStrictEqual(resources.context.b2.calls, []);
  } finally {
    await _closeSetupResources({ directory, resources });
  }
}
