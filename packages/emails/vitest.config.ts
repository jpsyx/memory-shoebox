import { defineConfig } from "vitest/config";

/** Test configuration for the email templates package. */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
  },
});
