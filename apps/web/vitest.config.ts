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
  },
  resolve: {
    tsconfigPaths: true,
  },
});
