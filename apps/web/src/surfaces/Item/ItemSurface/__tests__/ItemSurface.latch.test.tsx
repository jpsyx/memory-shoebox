import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemDetail } from "@memory-shoebox/shared";
import {
  JUST_ME_VISIBILITY,
  LOVED_BY_SIGNED_IN,
  makeBurstDetail,
  makeComment,
  makeFrameIdFromPosition,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";
import type { Answer } from "@/testing/surfaceHarness";

const DETAIL = makeBurstDetail({
  position: 7,
  frameCount: 45,
  overrides: { capabilities: OWN_UPLOADER_CAPABILITIES },
});

/**
 * 22:30 UTC on 15 September, already the 16th in the Shoebox's Madrid, so
 * the date picker's last day is the same on every machine.
 */
const NOW = new Date("2026-09-15T22:30:00.000Z");

const COMMENT = makeComment({ author: SIGNED_IN, body: "Hello." });

/** What the server answers after each write, each on top of the one before. */
const TAGGED: ItemDetail = {
  ...DETAIL,
  comments: [COMMENT],
  reactions: LOVED_BY_SIGNED_IN,
  tags: [
    ...DETAIL.tags,
    { tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" },
  ],
};

const HIDDEN: ItemDetail = { ...TAGGED, visibility: JUST_ME_VISIBILITY };

/** Moved to the 15th, which takes the frame out of its burst. */
const REDATED: ItemDetail = {
  ...HIDDEN,
  capturedAt: "2026-09-15T04:41:00.000Z",
  capturedOn: "2026-09-15",
  captureSource: "uploader_set",
  burst: null,
  burstPosition: null,
  burstFrames: [],
};

afterEach(() => {
  vi.useRealTimers();
});

/** Every `GET` of any item's permalink, which is every open counted. */
function _opens(): string[] {
  return recordedRequests().filter((line) => {
    return /^GET \/api\/items\/[0-9a-f-]+$/u.test(line);
  });
}

/** Every write the five legs below make, answered. */
function _writeAnswers(): Record<string, Answer> {
  const itemPath = `/api/items/${DETAIL.itemId}`;
  return {
    [`POST ${itemPath}/comments`]: { body: COMMENT, status: 201 },
    [`PUT ${itemPath}/reaction`]: { body: LOVED_BY_SIGNED_IN, status: 200 },
    [`PUT ${itemPath}/tags`]: { body: TAGGED, status: 200 },
    "POST /api/visibility-rules/resolve": {
      body: {
        visibilityRuleId: JUST_ME_VISIBILITY.visibilityRuleId,
        visibility: JUST_ME_VISIBILITY,
      },
      status: 200,
    },
    [`PATCH ${itemPath}/visibility`]: { body: HIDDEN, status: 200 },
    [`POST ${itemPath}/capture-date`]: { body: REDATED, status: 200 },
  };
}

/** Says something, and waits for it in the thread. */
async function _comment(): Promise<void> {
  await userEvent.type(
    await screen.findByRole("textbox", { name: "Say something" }),
    "Hello.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Hello.");
}

/** Loves the photograph, and waits for the request to go. */
async function _react(): Promise<void> {
  await userEvent.click(screen.getAllByRole("button", { name: /^React$/ })[0]!);
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Love",
    }),
  );
  await waitFor(() => {
    expect(recordedRequests()).toContain(
      `PUT /api/items/${DETAIL.itemId}/reaction`,
    );
  });
}

/** Tags it "beach", and waits for the server's chip. */
async function _tag(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "+ Add a tag" }));
  await userEvent.type(
    screen.getByRole("combobox", { name: "Tags" }),
    "beach{enter}",
  );
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  await screen.findByRole("link", { name: "beach" });
}

/** Makes it Just me, and waits for the sheet to say so. */
async function _changeVisibility(): Promise<void> {
  const sheet = screen.getByRole("region", { name: "Who can see this" });
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Change who can see it" }),
  );
  await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
  await userEvent.click(within(sheet).getByLabelText("Only these"));
  await userEvent.click(await screen.findByRole("option", { name: /Papá/ }));
  await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await within(sheet).findByText("Just me");
}

/** Moves it to the 15th, and waits for the sheet to say so. */
async function _correctDate(): Promise<void> {
  const sheet = screen.getByRole("region", { name: "When this was taken" });
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Put the date right" }),
  );
  await userEvent.click(within(sheet).getByLabelText("The day it was taken"));
  await userEvent.click(
    await screen.findByRole("button", { name: "15 September 2026" }),
  );
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Put it right" }),
  );
  await within(sheet).findByText("15 September 2026, 6:41 am");
}

describe("what opening an item latches", () => {
  it("counts one open for one arrival, and latches nothing of its own", async () => {
    respondWithItem({ detail: DETAIL });
    renderItem(DETAIL.itemId);

    await screen.findByRole("navigation", { name: /45 frames/ });

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
    expect(
      recordedRequests().some((line) => {
        return line.includes("/api/items/seen");
      }),
    ).toBe(false);
  });

  it("sends nothing when a link to another item is preloaded", async () => {
    respondWithItem({ detail: DETAIL });
    const { router } = renderItem(DETAIL.itemId);
    await screen.findByRole("navigation", { name: /45 frames/ });
    const requestsBefore = recordedRequests();

    await router.preloadRoute({
      to: "/items/$itemId",
      params: { itemId: makeFrameIdFromPosition(8) },
    });

    expect(recordedRequests()).toEqual(requestsBefore);
  });

  it("still counts one open after a comment, a reaction, a tag, a visibility change and a date correction", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    respondWithItem({ detail: DETAIL, routes: _writeAnswers() });
    renderItem(DETAIL.itemId);

    await _comment();
    await _react();
    await _tag();
    await _changeVisibility();
    await _correctDate();

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
  });

  it("asks once more, and says why, when a write is refused", async () => {
    respondWithItem({
      detail: DETAIL,
      routes: {
        [`PUT /api/items/${DETAIL.itemId}/tags`]: {
          body: { error: "item_edit_forbidden", message: "x" },
          status: 403,
        },
      },
    });
    renderItem(DETAIL.itemId);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "beach{enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can no longer change this one.",
    );
    await waitFor(() => {
      expect(_opens()).toHaveLength(2);
    });
  });
});
