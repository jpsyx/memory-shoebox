import type {
  MediaNeighborsResponse,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { expect, it } from "vitest";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { makeApp } from "../../timelineContractTestHelpers.ts";

type DaySeedOptions = {
  database: Awaited<ReturnType<typeof makeApp>>["database"];
  memberId: string;
  capturedOn: string;
  sequenceStart: number;
};

async function _seedMixedDay(
  options: Readonly<DaySeedOptions>,
): Promise<string[]> {
  return Promise.all(
    [
      { time: "18:30", kind: "photo" },
      { time: "08:00", kind: "video" },
      { time: "18:30", kind: "video" },
      { time: "12:00", kind: "photo" },
    ].map(async ({ time, kind }, position) => {
      const itemId = await insertItem(options.database, {
        uploadedBy: options.memberId,
        seq: options.sequenceStart + position,
        captured_on: options.capturedOn,
        captured_at: `${options.capturedOn}T${time}:00.000Z`,
        kind,
        content_type: kind === "video" ? "video/mp4" : "image/jpeg",
        duration_ms: kind === "video" ? 1000 : null,
      });
      await insertRendition(options.database, { itemId, purpose: "thumb" });
      return itemId;
    }),
  );
}

async function _makeTimelineFixture() {
  const fixture = await makeApp();
  const { cookie, memberId } = await insertSignedInMember({
    database: fixture.database,
  });
  const olderIds = await _seedMixedDay({
    database: fixture.database,
    memberId,
    capturedOn: "2026-09-14",
    sequenceStart: 1,
  });
  const newerIds = await _seedMixedDay({
    database: fixture.database,
    memberId,
    capturedOn: "2026-09-15",
    sequenceStart: 5,
  });
  return {
    close: fixture.close,
    readNeighbors: async (itemId: string, direction: "next" | "previous") => {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/media/neighbors",
        headers: { cookie },
        payload: { itemId, direction, selection: { tags: [], people: [] } },
      });
      expect(response.statusCode).toBe(200);
      return response.json<MediaNeighborsResponse>();
    },
    olderIds,
    newerIds,
    read: async (query = ""): Promise<TimelineResponse> => {
      const response = await fixture.app.inject({
        method: "GET",
        url: `/api/timeline?${query}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json<TimelineResponse>();
    },
  };
}

it("returns newest-first days and media, with descending sequence ties for photos and videos", async () => {
  const fixture = await _makeTimelineFixture();
  try {
    const page = await fixture.read();
    expect(
      page.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-15", "2026-09-14"]);
    expect(
      page.days.map((day) => {
        return day.items.map((item) => {
          return item.itemId;
        });
      }),
    ).toEqual([
      [
        fixture.newerIds[2],
        fixture.newerIds[0],
        fixture.newerIds[3],
        fixture.newerIds[1],
      ],
      [
        fixture.olderIds[2],
        fixture.olderIds[0],
        fixture.olderIds[3],
        fixture.olderIds[1],
      ],
    ]);
    expect(
      page.days[0]!.items.map((item) => {
        return item.kind;
      }),
    ).toEqual(["video", "photo", "photo", "video"]);
  } finally {
    await fixture.close();
  }
});

it("keeps newest-first media after older paging, newer paging, and date filtering", async () => {
  const fixture = await _makeTimelineFixture();
  try {
    const newest = await fixture.read("limit=1");
    expect(newest.nextCursor).not.toBeNull();
    const older = await fixture.read(
      `limit=1&cursor=${encodeURIComponent(newest.nextCursor!)}`,
    );
    expect(
      older.days[0]!.items.map((item) => {
        return item.itemId;
      }),
    ).toEqual([
      fixture.olderIds[2],
      fixture.olderIds[0],
      fixture.olderIds[3],
      fixture.olderIds[1],
    ]);
    expect(older.previousCursor).not.toBeNull();
    const restored = await fixture.read(
      `limit=1&cursor=${encodeURIComponent(older.previousCursor!)}`,
    );
    expect(restored.days).toEqual(newest.days);
    const filtered = await fixture.read("from=2026-09-14&until=2026-09-14");
    expect(filtered.days).toEqual(older.days);
  } finally {
    await fixture.close();
  }
});

it("keeps viewer neighbors aligned with timeline order across times, ties, and day boundaries", async () => {
  const fixture = await _makeTimelineFixture();
  try {
    const page = await fixture.read();
    const itemIds = page.days.flatMap((day) => {
      return day.items.map((item) => {
        return item.itemId;
      });
    });
    for (const [position, itemId] of itemIds.entries()) {
      for (const direction of ["next", "previous"] as const) {
        const neighbors = await fixture.readNeighbors(itemId, direction);
        const aheadIds =
          direction === "next"
            ? itemIds.slice(position + 1, position + 3)
            : itemIds.slice(Math.max(0, position - 2), position).reverse();
        const behindIds =
          direction === "next"
            ? itemIds.slice(Math.max(0, position - 1), position)
            : itemIds.slice(position + 1, position + 2);
        expect(
          neighbors.ahead.map((item) => {
            return item.itemId;
          }),
        ).toEqual(aheadIds);
        expect(
          neighbors.behind.map((item) => {
            return item.itemId;
          }),
        ).toEqual(behindIds);
      }
    }
  } finally {
    await fixture.close();
  }
});
