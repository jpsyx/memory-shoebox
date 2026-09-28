import { describe, expect, it } from "vitest";
import {
  requireViewer,
  type Viewer,
} from "../../src/http/requestContextHelpers.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: ["rule-everyone"],
};

describe("the request context", () => {
  it("attaches nothing when nothing authenticates the request", async () => {
    const context = await createTestApp();
    context.app.get("/api/who", (request) => {
      return { viewer: request.viewer };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/who",
    });

    // An undefined viewer does not serialise, so the key being absent from the
    // body is exactly the handler having seen no viewer.
    expect(response.json()).toEqual({});
    await context.close();
  });

  it("attaches whatever the authenticator returned, before any handler runs", async () => {
    const context = await createTestApp({
      authenticate: () => {
        return Promise.resolve(ROSA);
      },
    });
    context.app.get("/api/who", (request) => {
      return { viewer: requireViewer(request) };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/who",
    });

    expect(response.json().viewer).toEqual(ROSA);
    await context.close();
  });

  it("requireViewer answers 401 not_signed_in when there is no viewer", async () => {
    const context = await createTestApp();
    context.app.get("/api/who", (request) => {
      return { viewer: requireViewer(request) };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/who",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "not_signed_in" });
    await context.close();
  });
});

describe("the caller's address behind a proxy", () => {
  /** Answers with whatever Fastify decided `request.ip` is. */
  async function readSeenAddress(options: {
    nodeEnv: string;
  }): Promise<string | undefined> {
    const context = await createTestApp({
      config: createTestConfig({ NODE_ENV: options.nodeEnv }),
    });
    context.app.get("/api/whence", (request) => {
      return { ip: request.ip };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/whence",
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });

    const seen: unknown = response.json().ip;
    await context.close();
    return typeof seen === "string" ? seen : undefined;
  }

  it("believes one hop in production, because Fly's proxy is that hop", async () => {
    // Without this the per-IP sign-in limit is one bucket for the whole
    // instance, and twenty requests in an hour lock the family out.
    expect(await readSeenAddress({ nodeEnv: "production" })).toBe(
      "203.0.113.7",
    );
  });

  it("believes nobody in development, because nothing fronts pnpm dev:server", async () => {
    expect(await readSeenAddress({ nodeEnv: "development" })).toBe("10.0.0.1");
  });
});
