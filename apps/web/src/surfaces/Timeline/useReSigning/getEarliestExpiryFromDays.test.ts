import { describe, expect, it } from "vitest";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtures";
import { getEarliestExpiryFromDays } from "@/surfaces/Timeline/useReSigning/getEarliestExpiryFromDays";

function _itemExpiring(at: string) {
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

  it("looks at the poster and the video sources too", () => {
    const item = makeItem({
      media: {
        ...makeItem().media,
        poster: makeMediaSource({ expiresAt: "2026-09-27T09:00:00.000Z" }),
        video: {
          webm: makeMediaSource({ expiresAt: "2026-09-27T08:00:00.000Z" }),
          mp4: null,
        },
      },
    });
    expect(getEarliestExpiryFromDays([makeDay({ items: [item] })])).toBe(
      "2026-09-27T08:00:00.000Z",
    );
  });
});
