import { describe, expect, it } from "vitest";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { ITEM_CASES } from "./itemNotFoundParityTestHelpers.ts";

describe("a photograph somebody is tagged in but may not see", () => {
  it("does not make item_people a key", async () => {
    // A photograph restricted to admins, people-tagged for a viewer whose
    // linked person is on it. Being in a photograph is not a key to it
    // (Decision 7): the tag gate only ever subtracts, so the item is a 404 on
    // every route above and absent from that viewer's timeline.
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const adminId = await insertMember(database, { role: "admin" });
    const adminsOnlyRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: adminsOnlyRuleId,
      memberId: adminId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: adminId,
      visibility_rule_id: adminsOnlyRuleId,
      captured_on: "2026-09-27",
    });
    await insertRendition(database, { itemId });
    await insertRendition(database, { itemId, purpose: "original" });

    const tagged = await insertSignedInMember({
      database,
      token: "the-person-in-the-photograph",
    });
    const personId = await insertPerson(database, {
      displayName: "Whoever is in it",
      member_id: tagged.memberId,
    });
    await insertItemPerson(database, { itemId, personId });

    const statuses = await Promise.all(
      ITEM_CASES.map(async (notFoundCase) => {
        const response = await app.inject({
          method: notFoundCase.method,
          url: notFoundCase.path(itemId),
          headers: { cookie: tagged.cookie },
          ...(notFoundCase.payload === undefined
            ? {}
            : { payload: notFoundCase.payload }),
        });
        return {
          name: notFoundCase.name,
          status: response.statusCode,
          error: response.json().error,
        };
      }),
    );

    expect(statuses).toEqual(
      ITEM_CASES.map((notFoundCase) => {
        return {
          name: notFoundCase.name,
          status: 404,
          error: "item_not_found",
        };
      }),
    );

    const timeline = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: tagged.cookie },
    });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: null,
    });
    expect(timeline.body).not.toContain(itemId);

    // The rail is the other surface a day count reaches, and the same tag
    // must not put a band on it either.
    const rail = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie: tagged.cookie },
    });
    expect(rail.json()).toEqual({ days: [], nextCursor: null });

    await close();
  });
});
