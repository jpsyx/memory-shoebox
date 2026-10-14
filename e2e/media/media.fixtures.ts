import { test as base, expect } from "@playwright/test";
import {
  createMediaAcceptanceCatalog,
  type MediaAcceptanceCatalog,
} from "../support/createMediaAcceptanceCatalog.ts";

/** Each browser case owns independent session, catalog and bucket origins. */
export const test = base.extend<{ catalog: MediaAcceptanceCatalog }>({
  catalog: async ({ browserName }, provide) => {
    void browserName;
    const catalog = await createMediaAcceptanceCatalog();
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

/** Assertions shared by the local media evidence scenarios. */
export { expect };
