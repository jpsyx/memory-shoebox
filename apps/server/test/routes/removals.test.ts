import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertPerson,
  insertItemPerson,
  insertMember,
  insertRendition,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("removal requests", () => {
  it("creates snapshots, rejects duplicate asks, refuses proxy withdrawal, and permits asking again after decline", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const requester = await insertSignedInMember({
        database,
        member: { role: "viewer" },
      });
      const uploader = await insertSignedInMember({
        database,
        token: "uploader",
        member: { role: "uploader" },
      });
      const admin = await insertSignedInMember({
        database,
        token: "admin",
        member: { role: "admin" },
      });
      const itemId = await insertItem(database, {
        uploadedBy: uploader.memberId,
      });
      await insertRendition(database, {
        itemId,
        purpose: "original",
        storage_key: "private/original",
      });
      const personId = await insertPerson(database, {
        displayName: "Requester",
        member_id: requester.memberId,
      });
      await insertItemPerson(database, { itemId, personId });
      const ask = () => {
        return app.inject({
          method: "POST",
          url: `/api/items/${itemId}/removal-requests`,
          headers: { cookie: requester.cookie },
          payload: { reason: "  own words  " },
        });
      };
      const created = await ask();
      expect(created.statusCode).toBe(201);
      const requestId = created.json().requestId;
      expect(created.json()).toMatchObject({
        reason: "own words",
        state: "open",
        canWithdraw: true,
        canDecline: false,
      });
      expect(created.body).not.toContain("private/original");
      expect((await ask()).json().error).toBe("removal_already_requested");
      for (const member of [admin, uploader]) {
        const refused = await app.inject({
          method: "POST",
          url: `/api/removal-requests/${requestId}/withdraw`,
          headers: { cookie: member.cookie },
        });
        expect(refused.statusCode).toBe(403);
        expect(refused.json().error).toBe("removal_request_forbidden");
      }
      const decline = (reason: string) => {
        return app.inject({
          method: "POST",
          url: `/api/removal-requests/${requestId}/decline`,
          headers: { cookie: uploader.cookie },
          payload: { declineReason: reason },
        });
      };
      expect((await decline("  ")).statusCode).toBe(400);
      expect((await decline("my explanation")).json()).toMatchObject({
        state: "declined",
        declineReason: "my explanation",
      });
      expect((await decline("again")).json().error).toBe(
        "removal_request_not_open",
      );
      expect((await ask()).statusCode).toBe(201);
    } finally {
      await close();
    }
  });

  it("requires tags even for admins and hides inaccessible item existence", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const admin = await insertSignedInMember({
        database,
        token: "admin",
        member: { role: "admin" },
      });
      const itemId = await insertItem(database, {
        uploadedBy: await insertMember(database),
      });
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/items/${itemId}/removal-requests`,
            headers: { cookie: admin.cookie },
            payload: {},
          })
        ).json().error,
      ).toBe("removal_request_forbidden");
      const viewer = await insertSignedInMember({
        database,
        member: { role: "viewer" },
      });
      expect(
        (
          await app.inject({
            url: "/api/removal-requests",
            headers: { cookie: viewer.cookie },
          })
        ).json().error,
      ).toBe("removal_queue_forbidden");
    } finally {
      await close();
    }
  });

  it("rolls back request and earlier emails when a late outbound insert fails", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const requester = await insertSignedInMember({
        database,
        member: { role: "viewer" },
      });
      const uploader = await insertMember(database, { role: "uploader" });
      await insertMember(database, {
        role: "admin",
        email: "reject@example.com",
      });
      const itemId = await insertItem(database, { uploadedBy: uploader });
      const personId = await insertPerson(database, {
        displayName: "Requester",
        member_id: requester.memberId,
      });
      await insertItemPerson(database, { itemId, personId });
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://shoebox.example",
      });
      await sql`create trigger reject_removal_mail before insert on outbound_emails when new.to_address = 'reject@example.com' and exists (select 1 from outbound_emails where kind = 'removal_request') begin select raise(abort, 'targeted late insert'); end`.execute(
        database,
      );
      const response = await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/removal-requests`,
        headers: { cookie: requester.cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(500);
      expect(
        await database.selectFrom("removal_requests").selectAll().execute(),
      ).toEqual([]);
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await sql`drop trigger if exists reject_removal_mail`.execute(database);
      await close();
    }
  });
});
