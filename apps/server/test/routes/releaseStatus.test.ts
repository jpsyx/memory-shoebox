import { describe, expect, it, vi } from "vitest";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";

const STATUS = {
  status: "update_available",
  latestVersion: "1.2.0",
  checkedAt: "2026-10-11T00:00:00.000Z",
} as const;

describe("GET /api/settings/version", () => {
  it("returns release status to an admin", async () => {
    const { app } = await createOwnedTestApp({
      authenticate: async () => {
        return {
          memberId: "admin",
          sessionId: "session",
          role: "admin",
          isAdmin: true,
          visibleRuleIds: [],
        };
      },
      releaseStatusReader: async () => {
        return STATUS;
      },
    });
    const response = await app.inject("/api/settings/version");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(STATUS);
  });

  it.each(["viewer", "uploader", undefined] as const)(
    "refuses %s before checking for releases",
    async (role) => {
      const releaseStatusReader = vi.fn(async () => {
        return STATUS;
      });
      const { app } = await createOwnedTestApp({
        authenticate: async () => {
          return role === undefined
            ? undefined
            : {
                memberId: "member",
                sessionId: "session",
                role,
                isAdmin: false,
                visibleRuleIds: [],
              };
        },
        releaseStatusReader,
      });
      const response = await app.inject("/api/settings/version");
      expect(response.statusCode).toBe(role === undefined ? 401 : 403);
      expect(releaseStatusReader).not.toHaveBeenCalled();
    },
  );
});
