import { describe, expect, it } from "vitest";
import { requireViewer, type Viewer } from "../../src/http/requestContext.ts";
import { createTestApp } from "../helpers/testApp.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: ["rule-everyone"],
};

describe("the request context", () => {
  it("attaches null when nothing authenticates the request", async () => {
    const context = await createTestApp();
    context.app.get("/api/who", (request) => {
      return { viewer: request.viewer };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/who",
    });

    expect(response.json()).toEqual({ viewer: null });
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
