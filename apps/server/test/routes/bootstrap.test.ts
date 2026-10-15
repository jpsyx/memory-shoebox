import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers/miscSeedHelpers.ts";

describe("navigation bootstrap", () => {
  it("exposes only setup availability to anonymous fresh and initialized catalogs", async () => {
    const context = await createTestApp();
    try {
      const fresh = await context.app.inject({ url: "/api/bootstrap" });
      expect(fresh.statusCode).toBe(200);
      expect(fresh.headers["cache-control"]).toBe("no-store");
      expect(fresh.json()).toEqual({
        setup: { isRequired: true },
        account: null,
        progress: null,
      });
      await insertSignedInMember({
        database: context.database,
        member: { role: "admin" },
      });
      const initialized = await context.app.inject({ url: "/api/bootstrap" });
      expect(initialized.json()).toEqual({
        setup: { isRequired: false },
        account: null,
        progress: null,
      });
    } finally {
      await context.close();
    }
  });

  it("reads current account and private progress, then observes completion, demotion and revocation", async () => {
    const context = await createTestApp();
    try {
      const owner = await insertSignedInMember({
        database: context.database,
        member: { role: "admin" },
      });
      await insertInstanceSetting(context.database, {
        key: "setup.pending_member_id",
        value: owner.memberId,
      });
      const read = () => {
        return context.app.inject({
          url: "/api/bootstrap",
          headers: { cookie: owner.cookie },
        });
      };
      const pending = await read();
      expect(pending.statusCode).toBe(200);
      expect(pending.json()).toMatchObject({
        setup: { isRequired: false },
        account: {
          me: { role: "admin", member: { memberId: owner.memberId } },
        },
        progress: { needsInvitations: true },
      });
      const account = await context.app.inject({
        url: "/api/me",
        headers: { cookie: owner.cookie },
      });
      expect(pending.json().account).toEqual(account.json());
      await context.app.inject({
        method: "POST",
        url: "/api/setup/complete",
        headers: { cookie: owner.cookie },
      });
      expect((await read()).json().progress).toEqual({
        needsInvitations: false,
      });
      await context.database
        .updateTable("members")
        .set({ role: "viewer" })
        .where("id", "=", owner.memberId)
        .execute();
      expect((await read()).json()).toMatchObject({
        account: { me: { role: "viewer" } },
        progress: null,
      });
      await context.database
        .deleteFrom("sessions")
        .where("id", "=", owner.sessionId)
        .execute();
      expect((await read()).json()).toEqual({
        setup: { isRequired: false },
        account: null,
        progress: null,
      });
    } finally {
      await context.close();
    }
  });
});
