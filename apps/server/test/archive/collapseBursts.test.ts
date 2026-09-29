import { describe, expect, it } from "vitest";
import { makeDrawnEntriesFromItemRows } from "../../src/archive/collapseBursts.ts";
import type { ItemRow } from "../../src/archive/readItemsForDays.ts";

const makeRow = (overrides: Partial<ItemRow> & { itemId: string }): ItemRow => {
  return {
    kind: "photo",
    capturedAt: "2026-09-14T06:41:00.000Z",
    capturedOn: "2026-09-14",
    durationMs: null,
    altTextOverride: null,
    visibilityRuleId: "rule-everyone",
    uploadedBy: "member-1",
    burstId: null,
    isUnseen: false,
    ...overrides,
  };
};

describe("makeDrawnEntriesFromItemRows", () => {
  it("draws a plain item as itself", () => {
    const row = makeRow({ itemId: "a" });
    expect(
      makeDrawnEntriesFromItemRows({
        rows: [row],
        coverItemIdsByBurstId: new Map(),
      }),
    ).toEqual([{ item: row, burst: undefined }]);
  });

  it("draws a burst of one visible frame as a plain print", () => {
    const row = makeRow({ itemId: "a", burstId: "burst-1" });
    const entries = makeDrawnEntriesFromItemRows({
      rows: [row],
      coverItemIdsByBurstId: new Map([["burst-1", "a"]]),
    });
    expect(entries).toEqual([{ item: row, burst: undefined }]);
  });

  it("collapses two or more frames into one stack over the visible ones", () => {
    const first = makeRow({
      itemId: "a",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:41:00.000Z",
      isUnseen: true,
    });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [first, second],
      coverItemIdsByBurstId: new Map([["burst-1", "b"]]),
    });

    expect(entries).toEqual([
      {
        item: second,
        burst: {
          burstId: "burst-1",
          visibleFrameCount: 2,
          startsAt: "2026-09-14T06:41:00.000Z",
          endsAt: "2026-09-14T06:44:00.000Z",
          coverItemId: "b",
          hasUnseenFrames: true,
        },
      },
    ]);
  });

  it("falls back to the earliest visible frame when the cover is not visible", () => {
    const first = makeRow({ itemId: "a", burstId: "burst-1" });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [first, second],
      coverItemIdsByBurstId: new Map([["burst-1", "restricted-frame"]]),
    });

    expect(entries[0]?.item.itemId).toBe("a");
    expect(entries[0]?.burst?.coverItemId).toBe("a");
  });

  it("stands where the run started, whichever frame is the cover", () => {
    const earlier = makeRow({
      itemId: "plain",
      capturedAt: "2026-09-14T06:00:00.000Z",
    });
    const first = makeRow({
      itemId: "a",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:41:00.000Z",
    });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });
    const later = makeRow({
      itemId: "plain-2",
      capturedAt: "2026-09-14T07:00:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [earlier, first, second, later],
      coverItemIdsByBurstId: new Map([["burst-1", "b"]]),
    });

    expect(
      entries.map((entry) => {
        return entry.item.itemId;
      }),
    ).toEqual(["plain", "b", "plain-2"]);
  });

  it("says nothing is unseen when every visible frame has been seen", () => {
    const entries = makeDrawnEntriesFromItemRows({
      rows: [
        makeRow({ itemId: "a", burstId: "burst-1" }),
        makeRow({
          itemId: "b",
          burstId: "burst-1",
          capturedAt: "2026-09-14T06:44:00.000Z",
        }),
      ],
      coverItemIdsByBurstId: new Map([["burst-1", "a"]]),
    });
    expect(entries[0]?.burst?.hasUnseenFrames).toBe(false);
  });
});
