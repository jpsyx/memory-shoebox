import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@/testing/surfaceHarness";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
} from "@/testing/surfaceHarness";
import {
  makeBurst,
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtures";
import { renderTimeline } from "./TimelineSurface.fixtures";
import {
  answerBulkTimeline,
  tickBothTimelinePhotos,
} from "./timelineBulkTestHelpers";

const BULK_PATH = "POST /api/items/bulk-edit";
const FRAME_IDS = [1, 2, 3].map((index) => {
  return `018f0000-0000-7000-8000-00000000a00${index}`;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function _makeBurstAnswers() {
  const burst = makeBurst({ visibleFrameCount: 3, hasUnseenFrames: false });
  const timeline: Answer = {
    status: 200,
    body: {
      days: [makeDay({ items: [makeItem({ burst })] })],
      nextCursor: null,
      resultCount: null,
    },
  };
  const frames = FRAME_IDS.map((itemId, index) => {
    return {
      itemId,
      position: index + 1,
      thumb: makeMediaSource(),
      altText: `Frame ${index + 1}`,
    };
  });
  const frameAnswer: Answer = {
    status: 200,
    body: { frames, nextCursor: null },
  };
  return { burst, timeline, frames, frameAnswer };
}

async function _chooseThirdFrame(): Promise<void> {
  await userEvent.click(
    await screen.findByRole("button", {
      name: "A cartoon baby, 27 September 2026.",
    }),
  );
  await screen.findByRole("button", { name: "Frame 3" });
  await userEvent.click(screen.getByRole("button", { name: "Select photos" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Tick loaded photos" }),
  );
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Frame 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  await userEvent.click(screen.getByRole("button", { name: "Frame 1" }));
  await userEvent.click(screen.getByRole("button", { name: "Frame 2" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
}

describe("timeline bulk recovery", () => {
  it.each([
    {
      invalid: "x".repeat(101),
      correction: "summer{Enter}",
      expectedTags: ["summer"],
    },
    {
      invalid: Array.from({ length: 51 }, (_unused, index) => {
        return `Tag ${index}`;
      }).join(","),
      correction: "",
      expectedTags: Array.from({ length: 50 }, (_unused, index) => {
        return `Tag ${index}`;
      }),
    },
  ])(
    "keeps local validation failures editable and sends only corrected labels",
    async ({ invalid, correction, expectedTags }) => {
      answerBulkTimeline();
      renderTimeline();
      await tickBothTimelinePhotos();
      await userEvent.click(screen.getByRole("button", { name: "Add a tag" }));
      const input = screen.getByRole("combobox", { name: "Tags" });
      await userEvent.type(input, `${invalid}{Enter}`);
      await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Nothing was sent",
      );
      expect(input).toBeEnabled();
      expect(getRecordedCountFromLine(BULK_PATH)).toBe(0);
      expect(input).toHaveValue("");
      await userEvent.click(input);
      await userEvent.keyboard("{Backspace}");
      expect(screen.queryByText("Tag 50")).not.toBeInTheDocument();
      if (correction) {
        await userEvent.type(input, correction);
      }
      await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
      await waitFor(() => {
        expect(getRecordedBodyFromRequest(BULK_PATH)).toMatchObject({
          tags: expectedTags,
        });
      });
      expect(getRecordedCountFromLine(BULK_PATH)).toBe(1);
    },
  );

  it.each([503, 200, 404, "network"] as const)(
    "discards both copied burst maps when reviewing a %s response",
    async (status) => {
      const { burst, timeline, frames, frameAnswer } = _makeBurstAnswers();
      let loseResponse: () => void = () => {};
      const pendingResponse = new Promise<void>((_settle, reject) => {
        loseResponse = () => {
          reject(new TypeError("Failed to fetch"));
        };
      });
      answerBulkTimeline({
        "GET /api/timeline": timeline,
        [`GET /api/bursts/${burst.burstId}/frames`]: frameAnswer,
        [BULK_PATH]: {
          status: status === "network" ? 204 : status,
          waitFor: status === "network" ? pendingResponse : undefined,
          body: { error: "unavailable", message: "Unavailable" },
        },
      });
      renderTimeline();
      await _chooseThirdFrame();
      timeline.body = {
        days: [
          makeDay({
            items: [makeItem({ burst: { ...burst, visibleFrameCount: 2 } })],
          }),
        ],
        nextCursor: null,
        resultCount: null,
      };
      frameAnswer.body = { frames: frames.slice(0, 2), nextCursor: null };
      await userEvent.click(
        screen.getByRole("button", { name: "Delete 1 permanently" }),
      );
      if (status === "network") {
        loseResponse();
      }
      await screen.findByRole("alert");
      expect(
        screen.getByRole("button", { name: "Delete 1 permanently" }),
      ).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        await screen.findByRole("button", { name: "Select photos" }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Frame 3" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", {
          name: "A cartoon baby, 27 September 2026.",
        }),
      );
      expect(
        await screen.findByRole("button", { name: "Frame 2" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Frame 3" }),
      ).not.toBeInTheDocument();
      expect(getRecordedCountFromLine(BULK_PATH)).toBe(1);
    },
  );
});

it("preserves ticks after closing a definitive permission refusal", async () => {
  answerBulkTimeline({
    [BULK_PATH]: {
      status: 403,
      body: { error: "item_delete_forbidden", message: "Forbidden" },
    },
  });
  renderTimeline();
  await tickBothTimelinePhotos();
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Delete 2 permanently" }),
  );
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "Family photo 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("button", { name: "Family photo 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  expect(getRecordedCountFromLine(BULK_PATH)).toBe(1);
});
