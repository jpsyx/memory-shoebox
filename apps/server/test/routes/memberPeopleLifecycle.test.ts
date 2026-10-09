import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertInstanceSetting,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { seedMember } from "../../scripts/seedMember.ts";
import { BODY } from "./setup/__tests__/setupTestHelpers.ts";

const _makeApp = () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("member person lifecycle", () => {
  it("makes the setup admin a protected suggestion immediately", async () => {
    const { app, database, close } = await _makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: BODY,
    });
    expect(response.statusCode).toBe(201);
    expect(
      await database
        .selectFrom("people")
        .select(["member_id", "display_name"])
        .execute(),
    ).toEqual([
      { member_id: response.json().me.member.memberId, display_name: "Rosa" },
    ]);
    await close();
  });

  it("creates one linked person at invitation acceptance and keeps it on repeated sign-in", async () => {
    const { database, close } = await _makeApp();
    const seeded = await seedMember({
      database,
      email: "rosa@example.com",
      role: "viewer",
      baseUrl: "http://localhost:38473",
    });
    expect(await database.selectFrom("people").select("id").execute()).toEqual(
      [],
    );
    const pepper = Buffer.from("a".repeat(64), "hex");
    await [1, 2].reduce(async (previousAttempt, attempt) => {
      await previousAttempt;
      const minted = await runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return mintSignInCode({
            transaction,
            email: seeded.email,
            pepper,
            now: NOW,
          });
        },
      });
      expect(
        (
          await redeemSignInCode({
            database,
            email: seeded.email,
            code: minted.digits,
            pepper,
            now: NOW,
            userAgent: undefined,
            presentedToken: undefined,
          })
        ).kind,
      ).toBe("created");
      const people = await database
        .selectFrom("people")
        .select(["member_id", "display_name"])
        .execute();
      expect(people, `sign-in ${attempt}`).toEqual([
        { member_id: seeded.memberId, display_name: "rosa" },
      ]);
    }, Promise.resolve());
    await close();
  });

  it("renames the existing linked identity and tags when the member updates or clears their name", async () => {
    const { app, database, close } = await _makeApp();
    const member = await insertSignedInMember({
      database,
      member: { email: "rosa@example.com" },
    });
    const personId = await insertPerson(database, {
      displayName: "Old name",
      member_id: member.memberId,
    });
    const adHocId = await insertPerson(database, { displayName: "Rosa Maria" });
    const itemId = await insertItem(database, { uploadedBy: member.memberId });
    await insertItemPerson(database, { itemId, personId });
    await [
      ["Rosa Maria", "Rosa Maria"],
      ["", "rosa"],
    ].reduce(async (previousNameChange, [displayName, expected]) => {
      await previousNameChange;
      const response = await app.inject({
        method: "PATCH",
        url: "/api/me",
        headers: { cookie: member.cookie },
        payload: { displayName },
      });
      expect(response.statusCode).toBe(200);
      expect(
        await database
          .selectFrom("people")
          .select(["id", "display_name"])
          .where("member_id", "=", member.memberId)
          .execute(),
      ).toEqual([{ id: personId, display_name: expected }]);
    }, Promise.resolve());
    expect(
      await database
        .selectFrom("people")
        .select("member_id")
        .where("id", "=", adHocId)
        .executeTakeFirst(),
    ).toEqual({ member_id: null });
    expect(
      await database.selectFrom("item_people").select("person_id").execute(),
    ).toEqual([{ person_id: personId }]);
    await close();
  });

  it("keeps a removed member's linked identity when a new invitation changes their name", async () => {
    const { app, database, close } = await _makeApp();
    const admin = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const memberId = await insertMember(database, {
      email: "returning@example.com",
      status: "removed",
      removed_at: NOW,
    });
    const personId = await insertPerson(database, {
      displayName: "Old name",
      member_id: memberId,
    });
    const itemId = await insertItem(database, { uploadedBy: admin.memberId });
    await insertItemPerson(database, { itemId, personId });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { cookie: admin.cookie },
      payload: {
        email: "returning@example.com",
        role: "viewer",
        displayName: "New name",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(
      await database
        .selectFrom("people")
        .select(["id", "display_name"])
        .where("member_id", "=", memberId)
        .execute(),
    ).toEqual([{ id: personId, display_name: "New name" }]);
    expect(
      await database.selectFrom("item_people").select("person_id").execute(),
    ).toEqual([{ person_id: personId }]);
    await close();
  });

  it("repairs an existing active seeded member without creating another person", async () => {
    const { database, close } = await _makeApp();
    const memberId = await insertMember(database, {
      email: "ana@example.com",
      display_name: "Ana",
    });
    const options = {
      database,
      email: "ana@example.com",
      role: "viewer" as const,
      baseUrl: "http://localhost:38473",
    };
    await seedMember(options);
    await seedMember(options);
    expect(
      await database
        .selectFrom("people")
        .select(["member_id", "display_name"])
        .execute(),
    ).toEqual([{ member_id: memberId, display_name: "Ana" }]);
    await close();
  });
});
