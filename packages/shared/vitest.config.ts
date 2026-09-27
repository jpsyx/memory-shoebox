import { defineConfig } from "vitest/config";

/** Test configuration for the shared contract package. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
