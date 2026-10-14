import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  makeBurst,
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  getRecordedBodyFromRequest,
  recordedRequests,
} from "@/testing/surfaceHarness";
import { renderTimeline, respondWith } from "./TimelineSurface.fixtures";

const FIRST_ID = makeItem().itemId;
const SECOND_ID = "018f0000-0000-7000-8000-00000000a002";
const BULK_PATH = "POST /api/items/bulk-edit";

function _answerTimeline(
  options: { role?: "admin" | "uploader" | "viewer"; failure?: boolean } = {},
) {
  respondWith({
    "GET /api/me": {
      body: createMeResponse({ role: options.role ?? "admin" }),
      status: 200,
    },
    "GET /api/timeline": {
      body: {
        days: [
          makeDay({
            items: [
              makeItem(),
              makeItem({
                itemId: SECOND_ID,
                media: { ...makeItem().media, altText: "At the beach" },
              }),
            ],
          }),
        ],
        nextCursor: null,
        resultCount: null,
      },
      status: 200,
    },
    [BULK_PATH]: options.failure
      ? {
          body: { error: "item_delete_forbidden", message: "Forbidden" },
          status: 403,
        }
      : { body: undefined, status: 204 },
  });
}

async function _tickBoth() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Select photos" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "A cartoon baby, 27 September 2026." }),
  );
  await userEvent.click(screen.getByRole("button", { name: "At the beach" }));
}

describe("timeline bulk editing", () => {
  it("ticks photos without opening them, adds tags and clears confirmed ticks", async () => {
    _answerTimeline();
    const { router } = renderTimeline();
    await _tickBoth();
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(screen.getByRole("button", { name: "Add a tag" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "summer{Enter}",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(BULK_PATH)).toEqual({
        action: "tags",
        itemIds: [FIRST_ID, SECOND_ID],
        tags: ["summer"],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "At the beach" }),
    ).not.toHaveAttribute("aria-pressed");
    expect(
      recordedRequests().some((line) => {
        return line.startsWith("GET /api/items/");
      }),
    ).toBe(false);
  });

  it("requires irreversible deletion confirmation and cancellation writes nothing", async () => {
    _answerTimeline();
    renderTimeline();
    await _tickBoth();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", {
      name: "Delete 2 photos and videos?",
    });
    expect(dialog).toHaveTextContent("cannot be undone");
    expect(recordedRequests()).not.toContain(BULK_PATH);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(
      screen.getByRole("button", { name: "At the beach" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete 2 permanently",
      }),
    );
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(BULK_PATH)).toEqual({
        action: "delete",
        itemIds: [FIRST_ID, SECOND_ID],
      });
    });
  });

  it("retains selection and reports a refused deletion without automatic retries", async () => {
    _answerTimeline({ failure: true });
    renderTimeline();
    await _tickBoth();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 2 permanently" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("own uploads");
    expect(
      screen.getByRole("button", { name: "At the beach" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      recordedRequests().filter((line) => {
        return line === BULK_PATH;
      }),
    ).toHaveLength(1);
  });

  it("offers no bulk editing to viewers", async () => {
    _answerTimeline({ role: "viewer" });
    renderTimeline();
    await screen.findByRole("button", { name: "At the beach" });
    expect(
      screen.queryByRole("button", { name: "Select photos" }),
    ).not.toBeInTheDocument();
  });

  it("ticks every frame in loaded bursts and permits unticking individual frames", async () => {
    const burst = makeBurst({ visibleFrameCount: 2 });
    respondWith({
      "GET /api/timeline": {
        body: {
          days: [makeDay({ items: [makeItem({ burst })] })],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
      [`GET /api/bursts/${burst.burstId}/frames`]: {
        body: {
          frames: [FIRST_ID, SECOND_ID].map((itemId, index) => {
            return {
              width: 400,
              height: 267,
              previewState: "ready" as const,
              itemId,
              position: index + 1,
              thumb: makeMediaSource(),
              altText: `Frame ${index + 1}`,
            };
          }),
          nextCursor: null,
        },
        status: 200,
      },
    });
    renderTimeline();
    await userEvent.click(
      await screen.findByRole("button", { name: "Select photos" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tick loaded photos" }),
    );
    expect(
      await screen.findByRole("button", { name: "Frame 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Frame 2" }));
    expect(screen.getByRole("button", { name: "Frame 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
