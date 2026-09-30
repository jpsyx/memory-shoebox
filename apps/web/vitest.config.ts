import { defineConfig } from "vitest/config";

/**
 * Test configuration for the web app.
 *
 * This config stands alone rather than extending `vite.config.ts`, so the
 * app's plugins (React, the TanStack Router generator) do not run during
 * tests. The environment is jsdom because the design system's thirteen
 * components are tested by rendering them.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    /*
     * Above the `asyncUtilTimeout` in `vitest.setup.ts`, and that is the
     * whole reason for the number.
     *
     * Vitest's own default is 5000ms, the same figure the setup file gives
     * `findBy` and `waitFor`, so a slow case could spend the entire test
     * budget inside one wait and be killed a fraction before the element
     * arrived. The failure then reads "Test timed out in 5000ms", naming the
     * test rather than the wait, and the surface-9 device case failed that
     * way on roughly one full-suite run in three. A test timeout has to leave
     * room for the longest wait inside it plus the work around it.
     */
    testTimeout: 20_000,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
