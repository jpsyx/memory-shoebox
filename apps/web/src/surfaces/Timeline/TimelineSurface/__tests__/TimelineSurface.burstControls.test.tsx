import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtureHelpers";
import {
  BURST_ID,
  makeBurstFrameFromPosition,
  makeBurstSummary,
  makeItemDetail,
  makeFrameIdFromPosition,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  type Answer,
} from "@/testing/surfaceHarnessHelpers";
import { renderTimeline, respondWith } from "./timelineSurfaceTestHelpers";

/** A burst's first photo, which remains its cover after the second leaves. */
function _cover({
  visibleFrameCount,
  position = 1,
}: {
  visibleFrameCount: number;
  position?: number;
}): ReturnType<typeof makeItem> {
  return makeItem({
    itemId: makeFrameIdFromPosition(position),
    burst: makeBurstSummary({
      visibleFrameCount,
      coverItemId: makeFrameIdFromPosition(position),
    }),
  });
}

describe("timeline burst editing", () => {
  it.each([1, 2])(
    "keeps removed photo %s in the pile and the remaining burst open",
    async (position) => {
      const removedId = makeFrameIdFromPosition(position);
      const frames = [1, 2, 3].map((framePosition) => {
        return {
          ...makeBurstFrameFromPosition(framePosition),
          canRemoveFromBurst: true,
        };
      });
      const timeline: Answer = {
        body: {
          previousCursor: null,
          days: [makeDay({ items: [_cover({ visibleFrameCount: 3 })] })],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      };
      const burst: Answer = { body: { frames, nextCursor: null }, status: 200 };
      const write = `PATCH /api/items/${removedId}/burst`;
      respondWith({
        "GET /api/timeline": timeline,
        [`GET /api/bursts/${BURST_ID}/frames`]: burst,
        [write]: {
          body: makeItemDetail({ itemId: removedId, canRestoreBurst: true }),
          status: 200,
        },
      });
      renderTimeline();
      await userEvent.click(
        await screen.findByRole("button", {
          name: /A cartoon baby, 27 September 2026/,
        }),
      );
      await userEvent.click(
        await screen.findByRole("button", {
          name: `Photo ${position} options`,
        }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Make standalone" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Make this photo standalone?",
      });
      timeline.body = {
        previousCursor: null,
        days: [
          makeDay({
            items: [
              _cover({
                visibleFrameCount: 2,
                position: position === 1 ? 2 : 1,
              }),
              makeItem({
                itemId: removedId,
                media: { ...makeItem().media, altText: "The separate photo" },
              }),
            ],
          }),
        ],
        nextCursor: null,
        resultCount: null,
      };
      burst.body = {
        frames: frames
          .filter((frame) => {
            return frame.itemId !== removedId;
          })
          .map((frame, index) => {
            return { ...frame, position: index + 1 };
          }),
        nextCursor: null,
      };
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Make standalone" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Make this photo standalone?" }),
        ).toBeNull();
        expect(
          screen.getByRole("button", { name: "The separate photo" }),
        ).toBeVisible();
      });
      expect(
        screen.getAllByRole("button", { name: "Mateo, 14 September 2026" }),
      ).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Collapse" })).toBeVisible();
      expect(getRecordedBodyFromRequest(write)).toEqual({ action: "remove" });
      expect(getRecordedCountFromLine(`GET /api/items/${removedId}`)).toBe(0);
    },
  );
});
