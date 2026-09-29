import { describe, expect, it } from "vitest";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertMilestone,
  insertTag,
  insertItemTag,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

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
