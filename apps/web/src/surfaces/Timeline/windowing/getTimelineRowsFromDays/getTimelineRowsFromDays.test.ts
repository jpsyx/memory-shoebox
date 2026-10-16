import { expect, it } from "vitest";
import { makeBand, makeDay, makeItem } from "../../timelineFixtureHelpers";
import { getTimelineRowsFromDays } from "./getTimelineRowsFromDays";

it("keeps atomic-day headers and seeds while bounding media rows", () => {
  const items = Array.from({ length: 1000 }, (_, index) => {
    return makeItem({ itemId: `item-${index}` });
  });
  const day = makeDay({ items, milestoneBand: makeBand() });
  const rows = getTimelineRowsFromDays({ days: [day], columns: 4 });
  expect(rows[0]).toMatchObject({ kind: "header", day, itemIds: [] });
  expect(rows.slice(1)).toHaveLength(250);
  expect(rows[11]).toMatchObject({
    seedBase: 40,
    itemIds: items.slice(40, 44).map((item) => {
      return item.itemId;
    }),
  });
  expect(
    rows.flatMap((row) => {
      return row.itemIds;
    }),
  ).toEqual(
    items.map((item) => {
      return item.itemId;
    }),
  );
});

it("keeps stable row identities when earlier days are prepended", () => {
  const day = makeDay();
  const rows = getTimelineRowsFromDays({ days: [day], columns: 3 });
  const prepended = getTimelineRowsFromDays({
    days: [makeDay({ capturedOn: "2026-09-28" }), day],
    columns: 3,
  });
  expect(prepended.slice(2)).toEqual(rows);
});

it("rejects invalid column counts instead of looping forever", () => {
  expect(() => {
    return getTimelineRowsFromDays({ days: [makeDay()], columns: 0 });
  }).toThrow();
});

it.each([null, { width: 400, height: 267 }])(
  "packs the same presentation aspect as Print, including missing thumbs: %j",
  async (dimensions) => {
    const {
      makeBurstFrameFromPosition: makeBurstFrame,
      makeBurstSummary,
      BURST_ID,
    } = await import("@/testing/itemFixtureHelpers");
    const frames = Array.from({ length: 20 }, (_, index) => {
      const frame = makeBurstFrame(index + 1);
      return {
        ...frame,
        width: 4032,
        height: 3024,
        thumb: dimensions ? { ...frame.thumb!, ...dimensions } : null,
      };
    });
    const rows = getTimelineRowsFromDays({
      days: [
        makeDay({
          items: [
            makeItem({ burst: makeBurstSummary({ visibleFrameCount: 20 }) }),
          ],
        }),
      ],
      columns: 4,
      fanWidth: 1000,
      framesByBurstId: new Map([[BURST_ID, frames]]),
      expanded: new Map([[BURST_ID, { height: 0 }]]),
    });
    const lines = rows.filter((row) => {
      return row.frames;
    });
    expect(lines[0]!.frames).toHaveLength(dimensions ? 6 : 7);
    expect(
      lines.flatMap((row) => {
        return row.itemIds;
      }),
    ).toEqual(
      frames.map((frame) => {
        return frame.itemId;
      }),
    );
    lines.forEach((row) => {
      expect(
        row.frames!.reduce((width, frame) => {
          return (
            width +
            112 *
              ((frame.thumb ?? frame).width / (frame.thumb ?? frame).height) +
            8 -
            25.6
          );
        }, 0),
      ).toBeLessThanOrEqual(1000);
    });
  },
);

it("retains frame offsets, the twenty-frame cap and a single final row marker", async () => {
  const { makeBurstFrameFromPosition, makeBurstSummary, BURST_ID } =
    await import("@/testing/itemFixtureHelpers");
  const frames = Array.from({ length: 45 }, (_, index) => {
    return makeBurstFrameFromPosition(index + 1);
  });
  const day = makeDay({
    items: [
      makeItem({ itemId: "before" }),
      makeItem({ burst: makeBurstSummary({ visibleFrameCount: 45 }) }),
      makeItem({ itemId: "after" }),
    ],
  });
  const rows = getTimelineRowsFromDays({
    days: [day],
    columns: 4,
    fanWidth: Infinity,
    framesByBurstId: new Map([[BURST_ID, frames]]),
    expanded: new Map([[BURST_ID, { height: 0 }]]),
  });
  const lines = rows.filter((row) => {
    return row.frames !== undefined;
  });
  expect(
    lines.map((row) => {
      return [row.frameOffset, row.frames!.length];
    }),
  ).toEqual([
    [0, 20],
    [20, 20],
    [40, 5],
  ]);
  expect(rows[1]).toMatchObject({ seedBase: 0, itemIds: ["before"] });
  expect(rows.at(-1)).toMatchObject({
    seedBase: 2,
    itemIds: ["after"],
    isLast: true,
  });
  expect(
    rows.filter((row) => {
      return row.isLast;
    }),
  ).toHaveLength(1);
  expect(
    getTimelineRowsFromDays({ days: [makeDay({ items: [] })], columns: 4 }),
  ).toMatchObject([{ kind: "header", isLast: true }]);
});

it("admits an oversized first frame without empty lines and marks a trailing fan as final", async () => {
  const { makeBurstFrameFromPosition, makeBurstSummary, BURST_ID } =
    await import("@/testing/itemFixtureHelpers");
  const frames = [makeBurstFrameFromPosition(1), makeBurstFrameFromPosition(2)];
  const rows = getTimelineRowsFromDays({
    days: [makeDay({ items: [makeItem({ burst: makeBurstSummary() })] })],
    columns: 4,
    fanWidth: 1,
    framesByBurstId: new Map([[BURST_ID, frames]]),
    expanded: new Map([[BURST_ID, { height: 0 }]]),
  });
  expect(
    rows
      .filter((row) => {
        return row.frames;
      })
      .map((row) => {
        return row.frameOffset;
      }),
  ).toEqual([0, 1]);
  expect(rows.at(-1)).toMatchObject({ frames: [frames[1]], isLast: true });
});
