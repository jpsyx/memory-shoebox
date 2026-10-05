import { defineConfig } from "vitest/config";

/**
 * Workspace-root test configuration. It covers the repository's own tooling
 * under `scripts/`, and the end-to-end layer's support code under
 * `e2e/support/`, which is plain Node and has its own tests where it is more
 * than glue: the S3 stand-in is the first. Each package in `apps/` and
 * `packages/` owns its tests and its own vitest config; `pnpm test` runs this
 * config first and then fans out across the workspace.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/**/*.test.ts",
      "e2e/support/**/*.test.ts",
      "e2e/fixtures/cartoon-media/generator/*.test.ts",
    ],
  },
});
