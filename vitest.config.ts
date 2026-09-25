import { defineConfig } from "vitest/config";

/**
 * Workspace-root test configuration. It covers only the repository's own
 * tooling under `scripts/`. Each package in `apps/` and `packages/` owns its
 * tests and its own vitest config; `pnpm test` runs this config first and then
 * fans out across the workspace.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts"],
  },
});
