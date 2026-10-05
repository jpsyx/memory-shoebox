import { describe, expect, it } from "vitest";
import { ADMIN } from "../../../helpers/createConfiguredMailHealthApp.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";

describe("GET /api/mail/health", () => {
  it.each(["viewer", "uploader"] as const)(
    "refuses %s without returning configuration",
    async (role) => {
      const { app, close } = await createOwnedTestApp({
        authenticate: async () => {
          return { ...ADMIN, role, isAdmin: false };
        },
      });
      const response = await app.inject("/api/mail/health");
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("mail_forbidden");
      await close();
    },
  );

  it("requires a session", async () => {
    const { app, close } = await createOwnedTestApp();
    expect((await app.inject("/api/mail/health")).statusCode).toBe(401);
    await close();
  });
});
