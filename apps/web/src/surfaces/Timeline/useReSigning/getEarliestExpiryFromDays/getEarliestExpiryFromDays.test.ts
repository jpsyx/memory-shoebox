import { describe, expect, it } from "vitest";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtureHelpers";
import { getEarliestExpiryFromDays } from "@/surfaces/Timeline/useReSigning/getEarliestExpiryFromDays/getEarliestExpiryFromDays";

function _itemExpiring(at: string): ReturnType<typeof makeItem> {
  return makeItem({
    itemId: `item-${at}`,
    media: {
      ...makeItem().media,
      thumb: makeMediaSource({ expiresAt: at }),
      display: makeMediaSource({ expiresAt: at }),
    },
  });
}

describe("getEarliestExpiryFromDays", () => {
  it("finds the soonest signature across every day and every source", () => {
    const days = [
      makeDay({
        capturedOn: "2026-09-27",
        items: [_itemExpiring("2026-09-27T12:00:00.000Z")],
      }),
      makeDay({
        capturedOn: "2026-09-26",
        items: [_itemExpiring("2026-09-27T11:00:00.000Z")],
      }),
    ];
    expect(getEarliestExpiryFromDays(days)).toBe("2026-09-27T11:00:00.000Z");
  });

  it("answers nothing for a page with no items on it", () => {
    expect(getEarliestExpiryFromDays([makeDay({ items: [] })])).toBeUndefined();
    expect(getEarliestExpiryFromDays([])).toBeUndefined();
  });

  it.each(["poster", "playback"] as const)(
    "returns the %s expiry when that source expires first",
    (earliestSource) => {
      const earlierExpiry = "2026-09-27T08:00:00.000Z";
      const laterExpiry = "2026-09-27T09:00:00.000Z";
      const item = makeItem({
        media: {
          ...makeItem().media,
          thumb: makeMediaSource({ expiresAt: laterExpiry }),
          display: makeMediaSource({ expiresAt: laterExpiry }),
          poster: makeMediaSource({
            expiresAt:
              earliestSource === "poster" ? earlierExpiry : laterExpiry,
          }),
          playback: makeMediaSource({
            expiresAt:
              earliestSource === "playback" ? earlierExpiry : laterExpiry,
            purpose: "video_mp4",
            contentType: "video/mp4",
          }),
        },
      });
      expect(getEarliestExpiryFromDays([makeDay({ items: [item] })])).toBe(
        earlierExpiry,
      );
    },
  );
});
