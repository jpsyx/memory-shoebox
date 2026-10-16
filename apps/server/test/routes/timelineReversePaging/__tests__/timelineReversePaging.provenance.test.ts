import type { TimelineResponse } from "@memory-shoebox/shared";

import { describe, expect, it } from "vitest";

import { makeTimelineFilterFromQuery } from "../../../../src/archive/selectionFilterHelpers.ts";

import { makeDigestFromFilter } from "../../../../src/archive/timelineCursorHelpers/timelineCursorHelpers.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";

import { insertMilestone } from "../../../helpers/seedHelpers/seedHelpers.ts";

import {
  insertDrawableItem,
  makeApp,
} from "../../timelineContractTestHelpers.ts";
import { encodeCursor } from "./encodeCursor.ts";

describe("bidirectional atomic-day timeline pages", () => {
  it("accepts unversioned older cursors and rejects invalid directions and selection digests", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-20",
      });
      const f = makeDigestFromFilter(makeTimelineFilterFromQuery({}));
      const read = (payload: unknown) => {
        return fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?cursor=${encodeCursor(payload)}`,
        });
      };
      const legacy = await read({ d: "2026-09-21", f });
      expect(legacy.statusCode).toBe(200);
      expect(
        legacy.json().days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ).toEqual(["2026-09-20"]);
      for (const payload of [
        { v: 2, d: "2026-09-21", f, direction: "sideways" },
        { v: 2, d: "2026-09-21", f },
        { v: 2, d: "2026-09-21", f: "wrong", direction: "newer" },
        { v: 3, d: "2026-09-21", f, direction: "older" },
      ]) {
        const invalid = await read(payload);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json().details.fieldErrors.cursor).toBeDefined();
      }
    } finally {
      await fixture.close();
    }
  });
});
describe("bidirectional atomic-day timeline pages", () => {
  it("keeps both directions inside the effective at bound and content filters suppress occasion-only days", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      for (let index = 0; index < 6; index += 1) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn: `2026-09-${25 - index}`,
        });
      }
      // The web sends min(until, at) as the effective until, never raw at.
      const read = async (
        cursor: string | undefined,
      ): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?until=2026-09-23&limit=2${cursor === undefined ? "" : `&cursor=${cursor}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const first = await read(undefined);
      const second = await read(first.nextCursor ?? undefined);
      const restored = await read(second.previousCursor ?? undefined);
      const newerThanJumpDays = restored.days.filter((day) => {
        return day.capturedOn > "2026-09-23";
      });
      expect(newerThanJumpDays).toEqual([]);
      expect(restored.days).toEqual(first.days);
      expect(restored.previousCursor).toBeNull();
      const mismatched = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `/api/timeline?cursor=${second.previousCursor}`,
      });
      expect(mismatched.statusCode).toBe(400);
      await insertMilestone(fixture.database, {
        name: "Empty",
        startsOn: "2026-09-19",
      });
      const unknownTag = "018f0000-0000-7000-8000-000000009999";
      const content = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `/api/timeline?tags=${unknownTag}`,
      });
      expect(content.json()).toEqual({
        days: [],
        nextCursor: null,
        previousCursor: null,
        resultCount: 0,
      });
    } finally {
      await fixture.close();
    }
  });
});
