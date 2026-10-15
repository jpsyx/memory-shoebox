import type { TimelineResponse } from "@memory-shoebox/shared";

import { describe, expect, it } from "vitest";

import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";

import { insertMilestone } from "../../helpers/seedHelpers/seedHelpers.ts";

import {
  insertDrawableItem,
  makeApp,
} from "../__tests__/timelineContractTestHelpers.ts";

describe("bidirectional atomic-day timeline pages", () => {
  it("reverse traversal restores evicted pages without splitting days", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const originalIds: string[] = [];
      for (let index = 0; index < 16; index += 1) {
        originalIds.push(
          await insertDrawableItem(fixture.database, {
            uploadedBy: memberId,
            seq: index + 1,
            capturedOn: `2026-09-${String(30 - index).padStart(2, "0")}`,
          }),
        );
      }
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const pages = [await read(null)];
      for (let pageIndex = 1; pageIndex < 8; pageIndex += 1) {
        pages.push(await read(pages.at(-1)!.nextCursor));
      }
      expect(pages[0]!.previousCursor).toBeNull();
      expect(pages.at(-1)!.nextCursor).toBeNull();
      const retained = pages.slice(-5);
      const restored = [];
      for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
        const previous = await read(retained[0]!.previousCursor);
        restored.unshift(previous);
        retained.unshift(previous);
        retained.pop();
        expect(retained).toHaveLength(5);
      }
      const allDays = [...restored, ...pages.slice(3)].flatMap((page) => {
        return page.days;
      });
      const restoredIds = allDays.flatMap((day) => {
        return day.items.map((item) => {
          return item.itemId;
        });
      });
      expect(restoredIds).toEqual(originalIds);
      expect(
        new Set(
          allDays.map((day) => {
            return day.capturedOn;
          }),
        ).size,
      ).toBe(allDays.length);
    } finally {
      await fixture.close();
    }
  });
});
describe("bidirectional atomic-day timeline pages", () => {
  it("returns all 1,000 equal-date items together in either direction", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1001,
        capturedOn: "2026-09-21",
      });
      for (let index = 0; index < 1000; index += 1) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn: "2026-09-20",
        });
      }
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1002,
        capturedOn: "2026-09-19",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const newest = await read(null);
      const middle = await read(newest.nextCursor);
      const oldest = await read(middle.nextCursor);
      const restored = await read(oldest.previousCursor);
      expect(
        middle.days.map((day) => {
          return day.itemCount;
        }),
      ).toEqual([1000]);
      expect(restored.days).toEqual(middle.days);
      expect(
        new Set(
          restored.days[0]!.items.map((item) => {
            return item.itemId;
          }),
        ).size,
      ).toBe(1000);
    } finally {
      await fixture.close();
    }
  });
});
describe("bidirectional atomic-day timeline pages", () => {
  it("preserves occasion-only days, global overlap bands and descending response order", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-24",
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 2,
        capturedOn: "2026-09-18",
      });
      await insertMilestone(fixture.database, {
        name: "A week",
        startsOn: "2026-09-18",
        endsOn: "2026-09-24",
      });
      await insertMilestone(fixture.database, {
        name: "Quiet days",
        startsOn: "2026-09-20",
        endsOn: "2026-09-22",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=3${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        return response.json();
      };
      const first = await read(null);
      const second = await read(first.nextCursor);
      const reverse = await read(second.previousCursor);
      expect(reverse.days).toEqual(first.days);
      expect(
        reverse.days.map((day) => {
          return day.capturedOn;
        }),
      ).toEqual(["2026-09-24", "2026-09-23", "2026-09-22"]);
      expect(
        reverse.days.map((day) => {
          return day.itemCount;
        }),
      ).toEqual([1, 0, 0]);
      expect(reverse.days[2]!.milestoneBand?.milestone.name).toBe("Quiet days");
      expect(reverse.days[2]!.milestoneStrips[0]!.milestone.name).toBe(
        "A week",
      );
      const rail = await fixture.app.inject({
        method: "GET",
        url: "/api/timeline/rail",
        headers: { cookie },
      });
      expect(
        rail.json().days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ).toEqual([
        "2026-09-24",
        "2026-09-23",
        "2026-09-22",
        "2026-09-21",
        "2026-09-20",
        "2026-09-19",
        "2026-09-18",
      ]);
    } finally {
      await fixture.close();
    }
  });
});
