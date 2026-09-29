import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { filterFacetsResponseSchema } from "@memory-shoebox/shared";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertItemTag,
  insertPerson,
  insertTag,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/filters/facets", () => {
  let testApp: TestApp;
  let database: Kysely<Database>;
  let cookie: string;
  let beachId: string;
  let hospitalId: string;
  let elenaId: string;

  beforeEach(async () => {
    testApp = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    database = testApp.database;
    const member = await insertSignedInMember({ database });
    cookie = member.cookie;

    beachId = await insertTag(database, { name: "beach" });
    hospitalId = await insertTag(database, { name: "hospital" });
    elenaId = await insertPerson(database, { displayName: "Elena" });

    // Two at the beach, one of which has Elena in it; one at the hospital.
    const firstBeachId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 1,
    });
    const secondBeachId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 2,
    });
    const hospitalItemId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 3,
    });
    await insertItemTag(database, { itemId: firstBeachId, tagId: beachId });
    await insertItemTag(database, { itemId: secondBeachId, tagId: beachId });
    await insertItemTag(database, {
      itemId: hospitalItemId,
      tagId: hospitalId,
    });
    await insertItemPerson(database, {
      itemId: firstBeachId,
      personId: elenaId,
    });
  });

  it("counts what every chip is worth with nothing selected", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(filterFacetsResponseSchema.parse(response.json())).toEqual({
      tags: [
        {
          tag: { tagId: beachId, name: "beach" },
          isSelected: false,
          narrowedCount: 2,
          ownCount: null,
        },
        {
          tag: { tagId: hospitalId, name: "hospital" },
          isSelected: false,
          narrowedCount: 1,
          ownCount: null,
        },
      ],
      people: [
        {
          person: { personId: elenaId, displayName: "Elena" },
          isSelected: false,
          narrowedCount: 1,
          ownCount: null,
        },
      ],
      resultCount: 3,
    });
    await testApp.close();
  });

  it("narrows every other chip against the selection, in one pass", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${beachId}`,
      headers: { cookie },
    });

    const body = response.json();
    expect(body.resultCount).toBe(2);
    // The selected chip carries its own worth and no narrowed count.
    expect(body.tags[0]).toEqual({
      tag: { tagId: beachId, name: "beach" },
      isSelected: true,
      narrowedCount: null,
      ownCount: 2,
    });
    // Nothing at the beach is also at the hospital, and the chip stays.
    expect(body.tags[1]).toEqual({
      tag: { tagId: hospitalId, name: "hospital" },
      isSelected: false,
      narrowedCount: 0,
      ownCount: null,
    });
    expect(body.people[0].narrowedCount).toBe(1);
    await testApp.close();
  });

  it("holds the row's order against the selection", async () => {
    const unfiltered = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
      headers: { cookie },
    });
    const narrowed = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${hospitalId}`,
      headers: { cookie },
    });

    const names = (body: { tags: { tag: { name: string } }[] }) => {
      return body.tags.map((facet) => {
        return facet.tag.name;
      });
    };
    expect(names(narrowed.json())).toEqual(names(unfiltered.json()));
    await testApp.close();
  });

  it("reaches zero without erroring, which is what `none` is", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${beachId}&tags=${hospitalId}`,
      headers: { cookie },
    });
    expect(response.json().resultCount).toBe(0);
    await testApp.close();
  });

  it("takes an unknown id as a selection that matches nothing", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets?tags=0199c0a0-0000-7000-8000-00000000dead",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().resultCount).toBe(0);
    await testApp.close();
  });

  it("answers 401 with no session", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
    });
    expect(response.statusCode).toBe(401);
    await testApp.close();
  });
});
