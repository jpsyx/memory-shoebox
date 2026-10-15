import { expect, it } from "vitest";
import { makeBand, makeDay, makeItem } from "../timelineFixtures";
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
