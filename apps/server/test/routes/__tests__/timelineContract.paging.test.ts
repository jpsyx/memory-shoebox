import { describe, expect, it } from "vitest";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import { insertMilestone } from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

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
