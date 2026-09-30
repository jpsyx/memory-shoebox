import { describe, expect, it } from "vitest";
import { getSeenRequestFromSightings, type Sighting } from "@/api/items/seen";

const ITEM = "018f0000-0000-7000-8000-00000000a001";
const OTHER = "018f0000-0000-7000-8000-00000000a002";
const BURST = "018f0000-0000-7000-8000-00000000b001";

describe("getSeenRequestFromSightings", () => {
  it("sends nothing when everything in view has already been seen", () => {
    const sightings: readonly Sighting[] = [
      { kind: "item", id: ITEM, hasUnseen: false },
      { kind: "burst", id: BURST, hasUnseen: false },
    ];
    expect(getSeenRequestFromSightings(sightings)).toBeUndefined();
  });

  it("sends nothing at all for an empty batch", () => {
    expect(getSeenRequestFromSightings([])).toBeUndefined();
  });

  it("sends the whole batch as soon as one thing in it is unseen", () => {
    const sightings: readonly Sighting[] = [
      { kind: "item", id: ITEM, hasUnseen: false },
      { kind: "item", id: OTHER, hasUnseen: true },
    ];
    expect(getSeenRequestFromSightings(sightings)).toEqual({
      itemIds: [ITEM, OTHER],
      burstIds: [],
    });
  });

  it("puts a collapsed stack in burstIds, never its frames", () => {
    const sightings: readonly Sighting[] = [
      { kind: "burst", id: BURST, hasUnseen: true },
    ];
    expect(getSeenRequestFromSightings(sightings)).toEqual({
      itemIds: [],
      burstIds: [BURST],
    });
  });

  it("deduplicates, because one print can cross the viewport twice", () => {
    const sightings: readonly Sighting[] = [
      { kind: "item", id: ITEM, hasUnseen: true },
      { kind: "item", id: ITEM, hasUnseen: true },
    ];
    expect(getSeenRequestFromSightings(sightings)?.itemIds).toEqual([ITEM]);
  });

  it("never sends more ids than the route accepts", () => {
    const many: readonly Sighting[] = Array.from(
      { length: 700 },
      (_unused, index) => {
        return {
          kind: "item" as const,
          id: `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`,
          hasUnseen: true,
        };
      },
    );
    expect(getSeenRequestFromSightings(many)?.itemIds.length).toBe(500);
  });
});
