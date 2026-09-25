import { defineConfig } from "vitest/config";

/** Test configuration for the API server. Tests run in Node against the
 *  Fastify app built by `createApp`, using `app.inject` rather than a real
 *  socket, and against in-memory SQLite databases. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
