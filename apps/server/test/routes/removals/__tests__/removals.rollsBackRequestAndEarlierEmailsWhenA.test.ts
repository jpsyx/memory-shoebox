import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertPerson,
  insertItemPerson,
  insertMember,
  insertInstanceSetting,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _assertRollsBackRequestAndEarlierEmailsWhenA4(): Promise<void> {
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
}
describe("removal requests", (): void => {
  it(
    "rolls back request and earlier emails when a late outbound insert fails",
    _assertRollsBackRequestAndEarlierEmailsWhenA4,
  );
});
