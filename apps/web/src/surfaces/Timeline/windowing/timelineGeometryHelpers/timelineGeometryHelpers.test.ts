import { afterEach, expect, it, vi } from "vitest";
import { makeDay, makeItem } from "../../timelineFixtureHelpers";
import { getTimelineRowsFromDays } from "../getTimelineRowsFromDays/getTimelineRowsFromDays";
import { getIndexesFromTimelineViewport } from "./timelineGeometryHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("measures above before below, includes the threshold-crossing row and retains focus at index zero", () => {
  vi.stubGlobal("innerHeight", 100);
  const rows = getTimelineRowsFromDays({
    days: [
      makeDay({
        items: Array.from({ length: 8 }, (_, index) => {
          return makeItem({ itemId: `item-${index}` });
        }),
      }),
    ],
    columns: 1,
  });
  rows[0]!.itemIds = ["focused-header"];
  const size = vi.fn(() => {
    return 60;
  });
  expect(
    getIndexesFromTimelineViewport({
      rows,
      start: 3,
      end: 4,
      size,
      focusedItemId: "focused-header",
    }),
  ).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(size.mock.calls).toEqual([[2], [1], [5], [6]]);
});

it("reads the current viewport height before each additional measurement", () => {
  vi.stubGlobal("innerHeight", 100);
  const rows = getTimelineRowsFromDays({
    days: [
      makeDay({
        items: Array.from({ length: 8 }, () => {
          return makeItem();
        }),
      }),
    ],
    columns: 1,
  });
  const size = vi.fn(() => {
    vi.stubGlobal("innerHeight", 50);
    return 60;
  });
  expect(
    getIndexesFromTimelineViewport({ rows, start: 3, end: 4, size }),
  ).toEqual([2, 3, 4, 5]);
  expect(size.mock.calls).toEqual([[2], [5]]);
});
