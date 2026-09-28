import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/createTestApp.ts";

describe("createApp", () => {
  it("reports health on GET /api/health", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    await context.close();
  });

  it("returns JSON 404 for an unknown API route", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/nope",
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    await context.close();
  });
});
