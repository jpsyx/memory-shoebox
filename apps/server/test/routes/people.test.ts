import { describe, expect, it } from "vitest";
import { peopleResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/people", () => {
  it("counts per viewer and carries the whole directory's size", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    const elenaId = await insertPerson(database, { displayName: "Elena" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-11",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertItemPerson(database, { itemId, personId: mateoId });
    await insertItemPerson(database, { itemId: secondId, personId: mateoId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = peopleResponseSchema.parse(response.json());
    expect(body.peopleCount).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(body.people[0]?.person).toEqual({
      personId: mateoId,
      displayName: "Mateo",
    });
    expect(body.people[0]?.itemCount).toBe(2);
    expect(body.people[0]?.firstCapturedOn).toBe("2026-09-11");
    expect(body.people[0]?.lastCapturedOn).toBe("2026-09-14");
    // Nobody has been tagged in anything, which is a state of its own.
    expect(body.people[1]).toEqual({
      person: { personId: elenaId, displayName: "Elena" },
      itemCount: 0,
      firstCapturedOn: null,
      lastCapturedOn: null,
      face: null,
    });
    await close();
  });

  it("carries a person with no item_people rows at all", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const personId = await insertPerson(database, { displayName: "Abuela" });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.json().people).toEqual([
      {
        person: { personId, displayName: "Abuela" },
        itemCount: 0,
        firstCapturedOn: null,
        lastCapturedOn: null,
        face: null,
      },
    ]);
    await close();
  });

  it("reads 0 for a person whose every photograph is invisible, not 1", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const personId = await insertPerson(database, { displayName: "Papá" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertItemPerson(database, { itemId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    const [person] = response.json().people;
    expect(person.itemCount).toBe(0);
    expect(person.face).toBeNull();
    expect(response.body).not.toContain(itemId);
    await close();
  });

  it("falls back from a preferred face the viewer cannot see", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      captured_at: "2026-09-14T09:00:00.000Z",
      visibility_rule_id: hiddenRuleId,
    });
    const visibleId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-13T09:00:00.000Z",
    });
    await insertRendition(database, { itemId: hiddenId, purpose: "thumb" });
    await insertRendition(database, { itemId: visibleId, purpose: "thumb" });
    const personId = await insertPerson(database, {
      displayName: "Mateo",
      preferred_face_item_id: hiddenId,
    });
    await insertItemPerson(database, { itemId: hiddenId, personId });
    await insertItemPerson(database, { itemId: visibleId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    const [person] = response.json().people;
    expect(person.face.url).toContain(encodeURIComponent(`items/${visibleId}`));
    expect(response.body).not.toContain(hiddenId);
    await close();
  });

  it("uses the preferred face when the viewer can see it", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const preferredId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-10T09:00:00.000Z",
    });
    const recentId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-14T09:00:00.000Z",
    });
    await insertRendition(database, { itemId: preferredId, purpose: "thumb" });
    await insertRendition(database, { itemId: recentId, purpose: "thumb" });
    const personId = await insertPerson(database, {
      displayName: "Mateo",
      preferred_face_item_id: preferredId,
    });
    await insertItemPerson(database, { itemId: preferredId, personId });
    await insertItemPerson(database, { itemId: recentId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.json().people[0].face.url).toContain(
      encodeURIComponent(`items/${preferredId}`),
    );
    await close();
  });

  it("narrows by name without changing the directory's size", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertPerson(database, { displayName: "Sofía" });
    await insertPerson(database, { displayName: "Papá" });

    const response = await app.inject({
      method: "GET",
      url: "/api/people?q=sof",
      headers: { cookie },
    });
    expect(response.json().people).toHaveLength(1);
    expect(response.json().people[0].person.displayName).toBe("Sofía");
    expect(response.json().peopleCount).toBe(2);
    await close();
  });

  it("never carries a memberId, however the person is linked", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: memberId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.body).not.toContain(memberId);
    expect(Object.keys(response.json().people[0].person)).toEqual([
      "personId",
      "displayName",
    ]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/people" });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
