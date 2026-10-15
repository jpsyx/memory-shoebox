import { fireEvent, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it } from "vitest";

import { getRecordedRequests } from "@/testing/fetchStubHelpers";

import { makeBurstDetail } from "@/testing/itemFixtureHelpers";

import {
  recordedUrls,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

import {
  FIRST,
  LAST,
  MIDDLE,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "./ItemNavigationTestHelpers";

describe("viewer navigation", () => {
  it("clicks from photo to video and back without adding history entries or preloading opens", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(FIRST.itemId);
    const nextButton = await waitForNavigationReady();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${FIRST.itemId}`]);
    expect(
      recordedUrls().filter((url) => {
        return url.startsWith("/api/timeline") || url.includes("/bursts/");
      }),
    ).toEqual([]);
    const historyLength = router.history.length;
    await userEvent.click(nextButton);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await waitForNavigationReady();
    expect(screen.getByLabelText("Video player")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Previous photo or video" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    });
    expect(router.history.length).toBe(historyLength);
  });
});
describe("viewer navigation", () => {
  it.each([
    ["{ArrowRight}", LAST.itemId],
    ["l", LAST.itemId],
    ["{ArrowLeft}", FIRST.itemId],
    ["h", FIRST.itemId],
  ])("navigates with %s", async (key, expectedId) => {
    respondWithNavigationItems();
    const { router } = renderItem(MIDDLE.itemId);
    await waitForNavigationReady();
    await userEvent.keyboard(key);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${expectedId}`);
    });
  });
});
describe("viewer navigation", () => {
  it("stops at the first and last item without wrapping", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    expect(
      screen.getByRole("button", { name: "Previous photo or video" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("h{ArrowLeft}");
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    await userEvent.keyboard("l");
    await waitForNavigationReady();
    await userEvent.keyboard("l");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Next photo or video" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
    await userEvent.keyboard("l{ArrowRight}");
    expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
  });
});
describe("viewer navigation", () => {
  it("leaves typing, video controls, modified keys, and composition alone", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(MIDDLE.itemId);
    await waitForNavigationReady();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("hello{ArrowLeft}{ArrowRight}");
    expect(screen.getByRole("textbox")).toHaveValue("hello");
    fireEvent.keyDown(screen.getByLabelText("Video player"), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "h", metaKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(document.body, { key: "l", isComposing: true });
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    await userEvent.click(
      screen.getByRole("button", { name: "More video details" }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("hl{ArrowLeft}{ArrowRight}");
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
  });
});
describe("safe viewer intent", () => {
  it("warms backward after selecting an earlier sibling link", async () => {
    const detail = makeBurstDetail({ position: 2, frameCount: 3 });
    const target = makeBurstDetail({ position: 1, frameCount: 3 });
    respondWithNavigationItems(
      {
        [`GET /api/items/${detail.itemId}`]: { status: 200, body: detail },
        [`GET /api/items/${target.itemId}`]: { status: 200, body: target },
      },
      [target, detail],
    );
    const { router } = renderItem(detail.itemId);
    await userEvent.click(
      await screen.findByRole("link", { name: "Photo 1 of 3" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${target.itemId}`);
      expect(
        router.options
          .context!.queryClient.getQueryCache()
          .getAll()
          .some((query) => {
            return (
              query.queryKey[2] === "item-neighbours" &&
              query.queryKey[3] === target.itemId &&
              query.queryKey.at(-1) === "previous" &&
              query.state.status === "success"
            );
          }),
      ).toBe(true);
    });
  });
});
describe("safe viewer intent", () => {
  it("warms a focused and hovered sibling without any ordinary detail read", async () => {
    const detail = makeBurstDetail({ position: 1, frameCount: 3 });
    const target = makeBurstDetail({ position: 2, frameCount: 3 });
    respondWithItem({
      detail,
      routes: {
        "POST /api/media/preview": {
          status: 200,
          body: {
            items: [
              {
                itemId: target.itemId,
                kind: target.kind,
                width: target.media.width,
                height: target.media.height,
                media: {
                  ...target.media,
                  display: {
                    ...target.media.display!,
                    expiresAt: "2099-01-01T00:00:00Z",
                  },
                },
              },
            ],
          },
        },
      },
    });
    renderItem(detail.itemId);
    const sibling = await screen.findByRole("link", { name: "Photo 2 of 3" });
    fireEvent.pointerEnter(sibling);
    fireEvent.focus(sibling);
    fireEvent.touchStart(sibling);
    await waitFor(() => {
      expect(
        getRecordedRequests().filter((request) => {
          return request.url === "/api/media/preview";
        }),
      ).toHaveLength(1);
    });
    expect(
      getRecordedRequests().filter((request) => {
        return request.url === "/api/media/preview";
      })[0]!.body,
    ).toEqual({ itemIds: [target.itemId], purpose: "speculative-preview" });
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${detail.itemId}`]);
  });
});
