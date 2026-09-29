import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types/db.types.ts";
import { createDatabase } from "../../src/db/client.ts";
import { createQueryCountingDatabase } from "../helpers/createQueryCountingDatabase.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertGroup,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
  setBurstCover,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async (overrides: { database?: Kysely<Database> } = {}) => {
  return createTestApp({
    ...overrides,
    clock: () => {
      return new Date(NOW);
    },
  });
};

/** One photograph, drawable, on a day. */
async function insertDrawableItem(
  database: Kysely<Database>,
  options: {
    uploadedBy: string;
    seq: number;
    capturedOn?: string;
    capturedAt?: string;
    visibilityRuleId?: string;
  },
): Promise<string> {
  const capturedOn = options.capturedOn ?? "2026-09-14";
  const itemId = await insertItem(database, {
    uploadedBy: options.uploadedBy,
    seq: options.seq,
    captured_on: capturedOn,
    captured_at: options.capturedAt ?? `${capturedOn}T09:00:00.000Z`,
    ...(options.visibilityRuleId === undefined
      ? {}
      : { visibility_rule_id: options.visibilityRuleId }),
  });
  await insertRendition(database, { itemId, purpose: "thumb" });
  await insertRendition(database, { itemId, purpose: "display" });
  return itemId;
}

describe("the empty archive and the invisible one", () => {
  it("are byte-identical on the wire", async () => {
    const empty = await makeApp();
    const emptyMember = await insertSignedInMember({
      database: empty.database,
    });
    const emptyResponse = await empty.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: emptyMember.cookie },
    });

    const restricted = await makeApp();
    const restrictedMember = await insertSignedInMember({
      database: restricted.database,
    });
    const otherMemberId = await insertMember(restricted.database);
    const hiddenRuleId = await insertVisibilityRule(restricted.database, {
      mode: "only",
    });
    await insertDrawableItem(restricted.database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    const restrictedResponse = await restricted.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: restrictedMember.cookie },
    });

    expect(restrictedResponse.body).toBe(emptyResponse.body);
    expect(emptyResponse.body).toBe(
      '{"days":[],"nextCursor":null,"resultCount":null}',
    );

    await empty.close();
    await restricted.close();
  });

  it("carries no field that varies with what the viewer cannot see", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibilityRuleId: hiddenRuleId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(Object.keys(response.json()).sort()).toEqual([
      "days",
      "nextCursor",
      "resultCount",
    ]);
    await close();
  });
});

describe("a day of 212 that reads as 204", () => {
  it("counts and draws only what the viewer may see, and names nothing else", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });

    const visibleIds = await Promise.all(
      Array.from({ length: 204 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
        });
      }),
    );
    const hiddenIds = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: otherMemberId,
          seq: 300 + index,
          visibilityRuleId: hiddenRuleId,
        });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.itemCount).toBe(204);
    expect(day.unseenCount).toBe(204);
    expect(day.items).toHaveLength(204);
    expect(visibleIds).toHaveLength(204);
    hiddenIds.forEach((hiddenId) => {
      expect(response.body).not.toContain(hiddenId);
    });
    await close();
  });

  it("moves the count and the rows together when one item is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 1 });
    const movingId = await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: movingId, tagId });
    const milestoneId = await insertMilestone(database, {
      name: "A day at the beach",
      startsOn: "2026-09-14",
    });
    await insertItemMilestone(database, { itemId: movingId, milestoneId });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].itemCount).toBe(2);
    expect(before.json().days[0].items).toHaveLength(2);
    expect(before.json().days[0].milestoneBand.itemCount).toBe(1);

    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await database
      .updateTable("items")
      .set({ visibility_rule_id: hiddenRuleId })
      .where("id", "=", movingId)
      .execute();

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].itemCount).toBe(1);
    expect(after.json().days[0].items).toHaveLength(1);
    expect(after.json().days[0].milestoneBand.itemCount).toBe(0);
    await close();
  });

  it("keeps a photograph restricted to admins out of a viewer it tags", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const adminId = await insertMember(database, { role: "admin" });
    const adminsOnlyGroupId = await insertGroup(database, { name: "Admins" });
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: hiddenRuleId,
      groupId: adminsOnlyGroupId,
    });
    const hiddenId = await insertDrawableItem(database, {
      uploadedBy: adminId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    // Being in a photograph is not a key to it (Decision 7).
    const personId = await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: memberId,
    });
    await insertItemPerson(database, { itemId: hiddenId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.json().days).toEqual([]);
    await close();
  });
});

describe("the milestone-span union under a filter", () => {
  it("keeps a milestone-only day under a date range and drops it under a tag", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const taggedId = await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
      capturedOn: "2026-09-14",
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });

    const dated = await app.inject({
      method: "GET",
      url: "/api/timeline?from=2026-09-01&until=2026-09-30",
      headers: { cookie },
    });
    expect(
      dated.json().days.map((day: { capturedOn: string }) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);

    const tagged = await app.inject({
      method: "GET",
      url: `/api/timeline?tags=${tagId}`,
      headers: { cookie },
    });
    expect(
      tagged.json().days.map((day: { capturedOn: string }) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14"]);
    await close();
  });

  it("narrows to nothing on an unknown tag or person, rather than erroring", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 1 });
    const unknownId = "0199c0a0-0000-7000-8000-00000000dead";

    const byTag = await app.inject({
      method: "GET",
      url: `/api/timeline?tags=${unknownId}`,
      headers: { cookie },
    });
    expect(byTag.statusCode).toBe(200);
    expect(byTag.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: 0,
    });

    const byPerson = await app.inject({
      method: "GET",
      url: `/api/timeline?people=${unknownId}`,
      headers: { cookie },
    });
    expect(byPerson.statusCode).toBe(200);
    expect(byPerson.json().days).toEqual([]);
    await close();
  });
});

describe("paging the whole archive", () => {
  it("returns every day exactly once", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const days = [
      "2026-09-17",
      "2026-09-14",
      "2026-09-13",
      "2026-09-11",
      "2026-09-02",
    ];
    await Promise.all(
      days.map((capturedOn, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn,
        });
      }),
    );
    // A milestone-only day between two item days, which must page like one.
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-12",
    });

    const walk = async (
      cursor: string | null,
      seen: string[],
    ): Promise<string[]> => {
      const response = await app.inject({
        method: "GET",
        url: `/api/timeline?limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        headers: { cookie },
      });
      const body = response.json();
      const withThisPage = [
        ...seen,
        ...body.days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ];
      return body.nextCursor === null
        ? withThisPage
        : walk(body.nextCursor, withThisPage);
    };

    const visited = await walk(null, []);
    expect(visited).toEqual([
      "2026-09-17",
      "2026-09-14",
      "2026-09-13",
      "2026-09-12",
      "2026-09-11",
      "2026-09-02",
    ]);
    expect(new Set(visited).size).toBe(visited.length);
    await close();
  });

  it("opens an occasion's band once, however the pages fall", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await Promise.all(
      ["2026-09-21", "2026-09-20", "2026-09-19"].map((capturedOn, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn,
        });
      }),
    );
    await insertMilestone(database, {
      name: "Mateo's first week at home",
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1",
      headers: { cookie },
    });
    // The feed runs newest first, so the band opens on the occasion's last day.
    expect(first.json().days[0].milestoneBand.dayPosition).toBe(5);
    expect(first.json().days[0].milestoneBand.dayCount).toBe(5);

    const second = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });
    expect(second.json().days[0].milestoneBand).toBeNull();
    expect(second.json().days[0].milestoneStrips).toHaveLength(1);
    expect(second.json().days[0].milestoneStrips[0].dayPosition).toBe(4);
    await close();
  });

  it("gives the band to the narrowest span and strips the rest", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
      capturedOn: "2026-09-17",
    });
    await insertMilestone(database, {
      name: "Mateo's first week at home",
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
    });
    await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });

    // The range ends on the contested day. Without it the five-day span's own
    // days (the 18th to the 21st) sit above the 17th in a newest-first feed,
    // that span opens its band up there, and the 17th would fall to the
    // one-day occasion because the other was already open rather than because
    // it is the narrower span. Clipped here, neither has opened yet, so width
    // is the only thing that can decide this band.
    const response = await app.inject({
      method: "GET",
      url: "/api/timeline?until=2026-09-17",
      headers: { cookie },
    });
    const [day] = response.json().days;
    expect(day.capturedOn).toBe("2026-09-17");
    expect(day.milestoneBand.milestone.name).toBe("Home from the hospital");
    expect(day.milestoneStrips).toHaveLength(1);
    expect(day.milestoneStrips[0].milestone.name).toBe(
      "Mateo's first week at home",
    );
    // A strip prints "day 1 of 5" and a name, and carries no count.
    expect(day.milestoneStrips[0].dayCount).toBe(5);
    expect(day.milestoneStrips[0]).not.toHaveProperty("itemCount");
    await close();
  });
});

describe("a burst in the pile", () => {
  const seedBurst = async (
    database: Kysely<Database>,
    options: { memberId: string; hiddenRuleId?: string },
  ) => {
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: options.memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: options.memberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          captured_at: shiftMinutes({
            instant: "2026-09-14T06:41:00.000Z",
            minutes: index,
          }),
          burst_id: burstId,
          burst_index: index + 1,
          ...(index === 2 && options.hiddenRuleId !== undefined
            ? { visibility_rule_id: options.hiddenRuleId }
            : {}),
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
        return itemId;
      }),
    );
    return { burstId, frameIds };
  };

  it("draws one stack whose count and span cover the visible frames only", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });
    const visibleRuleId = await database
      .selectFrom("items")
      .select("visibility_rule_id")
      .where("id", "=", frameIds[0] ?? "")
      .executeTakeFirstOrThrow();
    expect(visibleRuleId).toBeDefined();

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    // Two visible frames of three, so the day counts two and draws one print.
    expect(day.itemCount).toBe(2);
    expect(day.items).toHaveLength(1);
    expect(day.items[0].burst).toEqual({
      burstId,
      visibleFrameCount: 2,
      startsAt: "2026-09-14T06:41:00.000Z",
      endsAt: "2026-09-14T06:42:00.000Z",
      coverItemId: frameIds[0],
      hasUnseenFrames: true,
    });
    expect(response.body).not.toContain(frameIds[2]);
    await close();
  });

  it("falls back to the earliest visible frame when the cover is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });
    await setBurstCover(database, {
      burstId,
      coverItemId: frameIds[2] ?? "",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst.coverItemId).toBe(
      frameIds[0],
    );
    expect(memberId).toBeDefined();
    await close();
  });

  it("draws a burst of one visible frame as a plain print", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      captured_on: "2026-09-14",
      burst_id: burstId,
      burst_index: 1,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst).toBeNull();
    await close();
  });

  it("makes a burst with no visible frames vanish from the day entirely", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: otherMemberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          burst_id: burstId,
          burst_index: index + 1,
          visibility_rule_id: hiddenRuleId,
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
      }),
    );
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 10 });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    const [day] = response.json().days;
    expect(day.itemCount).toBe(1);
    expect(day.items).toHaveLength(1);
    expect(response.body).not.toContain(burstId);
    await close();
  });
});

describe("the query plan", () => {
  it("costs the same for one print as for two hundred and fifty", async () => {
    const small = createQueryCountingDatabase(createDatabase(":memory:"));
    const smallApp = await makeApp({ database: small.database });
    const smallMember = await insertSignedInMember({
      database: smallApp.database,
    });
    await insertDrawableItem(smallApp.database, {
      uploadedBy: smallMember.memberId,
      seq: 1,
    });

    small.reset();
    const smallResponse = await smallApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: smallMember.cookie },
    });
    const smallQueries = small.getQueryCount();

    const large = createQueryCountingDatabase(createDatabase(":memory:"));
    const largeApp = await makeApp({ database: large.database });
    const largeMember = await insertSignedInMember({
      database: largeApp.database,
    });
    const largeDays = ["2026-09-14", "2026-09-13", "2026-09-12"];
    await Promise.all(
      Array.from({ length: 250 }, (_unused, index) => {
        return insertDrawableItem(largeApp.database, {
          uploadedBy: largeMember.memberId,
          seq: index + 1,
          capturedOn: largeDays[index % largeDays.length],
        });
      }),
    );
    await insertMilestone(largeApp.database, {
      name: "Three days",
      startsOn: "2026-09-12",
      endsOn: "2026-09-14",
    });

    large.reset();
    const largeResponse = await largeApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: largeMember.cookie },
    });
    const largeQueries = large.getQueryCount();

    expect(smallResponse.statusCode).toBe(200);
    expect(largeResponse.statusCode).toBe(200);
    expect(largeResponse.json().days).toHaveLength(3);
    // Three days and 250 prints cost what one day and one print costs, plus
    // the band count that only the large page has a band for. Neither number
    // grows with the page: that is the property, not the number itself.
    expect(largeQueries).toBeLessThanOrEqual(smallQueries + 1);
    expect(smallQueries).toBeLessThanOrEqual(14);

    await smallApp.close();
    await largeApp.close();
  });
});

describe("the latch and the day", () => {
  it("clears the accent dots the timeline reported", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].unseenCount).toBe(1);
    expect(before.json().days[0].items[0].isUnseen).toBe(true);

    await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].unseenCount).toBe(0);
    expect(after.json().days[0].items[0].isUnseen).toBe(false);
    expect(after.json().days[0].itemCount).toBe(1);
    await close();
  });
});
