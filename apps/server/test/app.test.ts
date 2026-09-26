import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { parseConfig } from "../src/config.ts";

async function createTestApp() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const config = parseConfig({
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "memory-shoebox-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
  });
  return createApp({ config, database, logger: false });
}

describe("createApp", () => {
  it("reports health on GET /api/health", async () => {
    const app = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    await app.close();
  });

  it("returns JSON 404 for an unknown API route", async () => {
    const app = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    await app.close();
  });
});
