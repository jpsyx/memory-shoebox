import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../src/http/registerErrorHandler.ts";
import {
  registerRequestContext,
  requireViewer,
  type Authenticator,
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

/**
 * A bare instance carrying the error handler and the request context, with one
 * route that answers with whatever `read` made of the viewer.
 *
 * **Not the whole application.** `createApp` installs the context inside its
 * `/api` scope, so that a request for a static asset does no database work, and
 * a Fastify hook belongs to the instance it was added to. A route added to the
 * root instance afterwards is outside that scope and would see no hook at all,
 * which is a state two of the three assertions below cannot tell from a viewer
 * the authenticator declined to build.
 *
 * @param options.authenticate How a request resolves to a viewer, if at all.
 * @param options.read How the handler reads the viewer: off the request, or
 *   through `requireViewer`.
 */
async function _createContextApp(options: {
  authenticate?: Authenticator;
  read: (request: FastifyRequest) => unknown;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerRequestContext(app, { authenticate: options.authenticate });
  app.get("/who", (request) => {
    return { viewer: options.read(request) };
  });
  await app.ready();
  return app;
}

describe("the request context", () => {
  it("attaches nothing when nothing authenticates the request", async () => {
    const app = await _createContextApp({
      read: (request) => {
        return request.viewer;
      },
    });

    const response = await app.inject({ method: "GET", url: "/who" });

    // An undefined viewer does not serialise, so the key being absent from the
    // body is exactly the handler having seen no viewer.
    expect(response.json()).toEqual({});
    await app.close();
  });

  it("attaches whatever the authenticator returned, before any handler runs", async () => {
    const app = await _createContextApp({
      authenticate: () => {
        return Promise.resolve(ROSA);
      },
      read: requireViewer,
    });

    const response = await app.inject({ method: "GET", url: "/who" });

    expect(response.json().viewer).toEqual(ROSA);
    await app.close();
  });

  it("requireViewer answers 401 not_signed_in when there is no viewer", async () => {
    const app = await _createContextApp({ read: requireViewer });

    const response = await app.inject({ method: "GET", url: "/who" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "not_signed_in" });
    await app.close();
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
