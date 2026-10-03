import { describe, expect, it } from "vitest";
import { timelineResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertItemPerson,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** Every test here reads the archive as one signed-in member, at one instant. */
const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/timeline", () => {
  it("keeps global bands under date filters, content filters, paging and legacy cursors", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const weekId = await insertMilestone(database, {
      name: "First week",
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
    });
    const homeId = await insertMilestone(database, {
      name: "Home",
      startsOn: "2026-09-17",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-20",
    });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });
    const full = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(full.json().days[0].milestoneBand.milestone.milestoneId).toBe(
      weekId,
    );
    for (const query of [
      "until=2026-09-20",
      `people=${personId}`,
      "limit=1&until=2026-09-20",
    ]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/timeline?${query}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().days[0].capturedOn).toBe("2026-09-20");
      expect(response.json().days[0].milestoneBand).toBeNull();
      expect(
        response.json().days[0].milestoneStrips[0].milestone.milestoneId,
      ).toBe(weekId);
    }
    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1",
      headers: { cookie },
    });
    const legacy = JSON.parse(
      Buffer.from(first.json().nextCursor, "base64url").toString(),
    );
    legacy.o = [weekId, homeId];
    const cursor = Buffer.from(JSON.stringify(legacy)).toString("base64url");
    const page = await app.inject({
      method: "GET",
      url: `/api/timeline?cursor=${cursor}`,
      headers: { cookie },
    });
    expect(
      page.json().days.find((day: { capturedOn: string }) => {
        return day.capturedOn === "2026-09-17";
      }).milestoneBand.milestone.milestoneId,
    ).toBe(homeId);
    await close();
  });
  it("answers an empty archive with the one shape the contract fixes", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: null,
    });
    await close();
  });

  it("answers a day with its counts, its prints and their media", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { display_name: "Lucía" },
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T09:12:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertRendition(database, { itemId, purpose: "display" });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = timelineResponseSchema.parse(response.json());
    expect(body.days).toHaveLength(1);
    const [day] = body.days;
    expect(day?.capturedOn).toBe("2026-09-14");
    expect(day?.itemCount).toBe(1);
    expect(day?.unseenCount).toBe(1);
    expect(day?.milestoneBand).toBeNull();
    expect(day?.milestoneStrips).toEqual([]);
    expect(day?.items).toHaveLength(1);

    const [item] = day?.items ?? [];
    expect(item?.itemId).toBe(itemId);
    expect(item?.kind).toBe("photo");
    expect(item?.isUnseen).toBe(true);
    expect(item?.uploadedBy).toEqual({ memberId, displayName: "Lucía" });
    expect(item?.burst).toBeNull();
    expect(item?.visibility).toEqual({
      visibilityRuleId: EVERYONE_VISIBILITY_RULE_ID,
      mode: "everyone",
      label: null,
      subjects: [],
    });
    expect(item?.media.altText).toBe("Mateo, 14 September 2026");
    expect(item?.media.thumb.url).toContain("https://b2.test/get/");
    expect(item?.media.thumb.expiresAt).toBe("2026-09-27T11:00:00.000Z");
    await close();
  });

  it("reads the alt text date in the Shoebox's own zone", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Australia/Sydney",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T21:30:00.000Z",
      captured_on: "2026-09-15",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.json().days[0].items[0].media.altText).toBe(
      "15 September 2026",
    );
    await close();
  });

  it("leaves an item with no renditions out of the prints and in the count", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.itemCount).toBe(1);
    expect(day.items).toEqual([]);
    await close();
  });

  it("carries a milestone-only day, which is still a day", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-08-02",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.capturedOn).toBe("2026-08-02");
    expect(day.itemCount).toBe(0);
    expect(day.items).toEqual([]);
    expect(day.milestoneBand.milestone.name).toBe("Home from the hospital");
    expect(day.milestoneBand.dayPosition).toBe(1);
    expect(day.milestoneBand.dayCount).toBe(1);
    expect(day.milestoneBand.itemCount).toBe(0);
    await close();
  });

  it("returns resultCount only on an uncursored filtered request", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const unfiltered = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(unfiltered.json().resultCount).toBeNull();

    const filtered = await app.inject({
      method: "GET",
      url: "/api/timeline?from=2026-09-01",
      headers: { cookie },
    });
    expect(filtered.json().resultCount).toBe(1);
    await close();
  });

  it("pages, and the cursor comes back for a page that has more", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1",
      headers: { cookie },
    });
    expect(first.json().days).toHaveLength(1);
    expect(first.json().nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });
    expect(second.json().days[0].capturedOn).toBe("2026-09-13");
    expect(second.json().nextCursor).toBeNull();
    expect(second.json().resultCount).toBeNull();
    await close();
  });

  it("refuses a cursor that belongs to a different selection", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1&from=2026-09-01",
      headers: { cookie },
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors.cursor).toBeDefined();
    await close();
  });

  it("refuses a cursor that does not decode", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline?cursor=not-a-cursor",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    await close();
  });

  it("refuses a limit over the cap", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const overLimit = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=31",
      headers: { cookie },
    });
    expect(overLimit.statusCode).toBe(400);
    expect(overLimit.json().details.fieldErrors.limit).toBeDefined();
    await close();
  });

  it("refuses a malformed date", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const badDate = await app.inject({
      method: "GET",
      url: "/api/timeline?from=14-09-2026",
      headers: { cookie },
    });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.json().details.fieldErrors.from).toBeDefined();
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/timeline" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });

  it("shows an admin everything, with the clause dropped", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: restrictedRuleId,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].itemId).toBe(itemId);
    await close();
  });
});
