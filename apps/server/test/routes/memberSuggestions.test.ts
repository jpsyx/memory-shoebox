import { describe, expect, it } from "vitest";
import { readMemberSuggestions } from "../../src/administration/readMemberSuggestions.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertPerson,
  insertItem,
  insertItemPerson,
} from "../helpers/seedHelpers/seedHelpers.ts";
const ADMIN = {
  memberId: "admin",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const;
describe("invitation name suggestions", () => {
  it("matches whole normalized words from local-part tokens, strips plus suffix, and caps at five by count", async () => {
    const { app, database, close } = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
    });
    const memberId = await insertMember(database);
    const people = await Promise.all(
      Array.from({ length: 7 }, async (_, index) => {
        const personId = await insertPerson(database, {
          displayName: `Rosa ${index}`,
        });
        await Promise.all(
          Array.from({ length: index }, async (_unusedItem, itemIndex) => {
            const itemId = await insertItem(database, {
              uploadedBy: memberId,
              seq: index * 10 + itemIndex,
            });
            await insertItemPerson(database, { itemId, personId });
          }),
        );
        return personId;
      }),
    );
    await insertPerson(database, { displayName: "Rosanna" });
    await insertPerson(database, { displayName: "Ignored" });
    const response = await app.inject(
      "/api/member-suggestions?email=ROSA.123_unknown%2Bignored%40example.com",
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      suggestions: [6, 5, 4, 3, 2].map((index) => {
        return {
          person: { personId: people[index], displayName: `Rosa ${index}` },
          itemCount: index,
        };
      }),
      nextCursor: null,
    });
    expect(
      (
        await app.inject("/api/member-suggestions?email=missing%40example.com")
      ).json().suggestions,
    ).toEqual([]);
    expect(
      (
        await app.inject("/api/member-suggestions?email=123%40example.com")
      ).json().suggestions,
    ).toEqual([]);
    await close();
  });
  it("folds Unicode case and NFC names without matching a word prefix", async () => {
    const { database, close } = await createTestApp();
    const personId = await insertPerson(database, {
      displayName: "  SOFI\u0301A  Rosa ",
    });
    await insertPerson(database, { displayName: "Sofíana" });
    expect(
      await readMemberSuggestions({
        database,
        email: "sofía+ignored@example.com",
      }),
    ).toEqual({
      suggestions: [
        {
          person: { personId, displayName: "  SOFI\u0301A  Rosa " },
          itemCount: 0,
        },
      ],
      nextCursor: null,
    });
    await close();
  });
  it.each(["viewer", "uploader"] as const)("refuses %s", async (role) => {
    const { app, close } = await createTestApp({
      authenticate: async () => {
        return { ...ADMIN, role, isAdmin: false };
      },
    });
    expect(
      (await app.inject("/api/member-suggestions?email=rosa%40example.com"))
        .statusCode,
    ).toBe(403);
    await close();
  });
  it("requires a session and a valid strict email query", async () => {
    const anonymous = await createTestApp();
    expect(
      (
        await anonymous.app.inject(
          "/api/member-suggestions?email=rosa%40example.com",
        )
      ).statusCode,
    ).toBe(401);
    await anonymous.close();
    const fixture = await createTestApp({
      authenticate: async () => {
        return ADMIN;
      },
    });
    expect(
      (await fixture.app.inject("/api/member-suggestions")).statusCode,
    ).toBe(400);
    expect(
      (await fixture.app.inject("/api/member-suggestions?email=invalid"))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await fixture.app.inject(
          "/api/member-suggestions?email=rosa%40example.com&limit=20",
        )
      ).statusCode,
    ).toBe(400);
    await fixture.close();
  });
});
