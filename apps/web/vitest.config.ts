import { defineConfig } from "vitest/config";

/**
 * Test configuration for the web app.
 *
 * This config stands alone rather than extending `vite.config.ts`, so the
 * app's plugins (React, the TanStack Router generator) do not run during
 * tests. The environment is Node today because there are no component tests
 * yet. Component tests need a DOM: install `jsdom` plus a DOM testing library
 * and set `environment: "jsdom"` when you write the first one.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
