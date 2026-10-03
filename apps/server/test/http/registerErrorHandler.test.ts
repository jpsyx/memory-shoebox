import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/createApp.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

async function _createAppWithThrowingRoutes(): Promise<TestApp> {
  const context = await createTestApp();
  context.app.get("/api/boom/api-error", () => {
    throw ApiError.notFound("item_not_found");
  });
  context.app.get("/api/boom/rate-limited", () => {
    throw ApiError.rateLimited(30);
  });
  context.app.get("/api/boom/zod", () => {
    z.object({ email: z.email() }).parse({ email: "nope" });
    return { unreachable: true };
  });
  context.app.get("/api/boom/unknown", () => {
    throw new Error("the database fell over, and it says so in English");
  });
  context.app.get("/api/boom/not-an-error", () => {
    throw null;
  });
  await context.app.ready();
  return context;
}

describe("the error handler", () => {
  it("renders an ApiError as the one envelope", async () => {
    const context = await _createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/api-error",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "item_not_found",
      message: "Not found.",
    });
    await context.close();
  });

  it("carries retryAfterSeconds in details and in the header", async () => {
    const context = await _createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/rate-limited",
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: "rate_limited",
      details: { retryAfterSeconds: 30 },
    });
    expect(response.headers["retry-after"]).toBe("30");
    await context.close();
  });

  it("turns a Zod failure into 400 invalid_request with fieldErrors", async () => {
    const context = await _createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/zod",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.details.fieldErrors.email).toHaveLength(1);
    await context.close();
  });

  it("never leaks an unexpected error's message to the client", async () => {
    const context = await _createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/unknown",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "internal_error",
      message: "Something went wrong.",
    });
    expect(response.body).not.toContain("database fell over");
    await context.close();
  });

  it("renders the envelope even when what was thrown is not an object", async () => {
    const context = await _createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/not-an-error",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "internal_error",
      message: "Something went wrong.",
    });
    await context.close();
  });
});

describe("request logging", () => {
  it("never writes the caller's address to a log line", async () => {
    const lines: string[] = [];
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const app = await createApp({
      config: createTestConfig(),
      database,
      b2: createFakeB2Client(),
      logger: {
        stream: {
          write: (line: string) => {
            lines.push(line);
          },
        },
      },
    });

    await app.inject({
      method: "GET",
      url: "/api/health",
      remoteAddress: "203.0.113.7",
    });

    const log = lines.join("");
    // The request really was logged, so the two assertions below are about an
    // address that is absent rather than a log that was never written.
    expect(log).toContain("/api/health");
    expect(log).not.toContain("203.0.113.7");
    expect(log).not.toContain("remoteAddress");
    await app.close();
    await database.destroy();
  });

  it("keeps the address out even when a caller adds its own serializer", async () => {
    const lines: string[] = [];
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const app = await createApp({
      config: createTestConfig(),
      database,
      b2: createFakeB2Client(),
      logger: {
        stream: {
          write: (line: string) => {
            lines.push(line);
          },
        },
        // The most natural next thing anyone does to this option. It must not
        // displace the `req` serializer, which is the only thing keeping the
        // caller's address out of the log (`data-models.md` § Privacy).
        serializers: {
          err: (error: Error) => {
            return {
              type: error.name,
              message: error.message,
              stack: error.stack ?? "",
            };
          },
        },
      },
    });

    await app.inject({
      method: "GET",
      url: "/api/health",
      remoteAddress: "203.0.113.7",
    });

    const log = lines.join("");
    expect(log).toContain("/api/health");
    expect(log).not.toContain("203.0.113.7");
    expect(log).not.toContain("remoteAddress");
    await app.close();
    await database.destroy();
  });
});
