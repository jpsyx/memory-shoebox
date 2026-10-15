import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";

import { createMeResponse } from "@/testing/createMeResponse";

import { act, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it, vi } from "vitest";

import { getRecordedRequests } from "@/testing/fetchStubHelpers";

import { makeDay } from "@/surfaces/Timeline/timelineFixtures";

import { recordedUrls, renderItem } from "@/testing/itemHarnessHelpers";

import { makeHold } from "@/testing/itemWriteTestHelpers";

import {
  FIRST,
  LAST,
  MIDDLE,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "./ItemNavigationTestHelpers";

describe("viewer navigation", () => {
  it("revalidates reused neighborhood authority on a later route mount", async () => {
    respondWithNavigationItems({}, [FIRST, LAST]);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const { router } = renderItem(FIRST.itemId);
      const queryClient = router.options.context!.queryClient;
      queryClient.setDefaultOptions({
        queries: { retry: false, staleTime: 30_000 },
      });
      const key = makeTimelineQueryOptionsFromView({
        memberId: createMeResponse().me.member.memberId,
        view: { selection: { tags: [], people: [] }, at: undefined },
      }).queryKey;
      const freshItems = [FIRST, LAST].map((item) => {
        return {
          ...item,
          media: {
            ...item.media,
            displayCandidates: [],
            thumb: { ...item.media.thumb!, expiresAt: "2099-01-01T00:00:00Z" },
            display: {
              ...item.media.display!,
              expiresAt: "2099-01-01T00:00:00Z",
            },
          },
        };
      });
      queryClient.setQueryData(
        key,
        {
          pages: [
            {
              selectionResultCount: null,
              previousCursor: null,
              metadataUpdatedAt: now - 29_000,
              days: [makeDay({ items: freshItems })],
              nextCursor: null,
              resultCount: null,
            },
          ],
          pageParams: [null],
        },
        { updatedAt: now - 29_000 },
      );
      const next = await waitForNavigationReady();
      expect(recordedUrls()).not.toContain("/api/media/neighbors");
      clock.mockReturnValue(now + 2_000);
      await userEvent.click(next);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Previous photo or video" }),
        ).not.toHaveAttribute("aria-disabled", "true");
      });
      await act(async () => {
        await router.navigate({
          to: "/items/$itemId",
          params: { itemId: FIRST.itemId },
        });
      });
      await waitForNavigationReady();
      expect(
        getRecordedRequests()
          .filter((request) => {
            return request.url === "/api/media/neighbors";
          })
          .map((request) => {
            return request.body;
          }),
      ).toContainEqual({
        itemId: FIRST.itemId,
        selection: { tags: [], people: [] },
        direction: "next",
      });
    } finally {
      clock.mockRestore();
    }
  });
});
describe("viewer navigation", () => {
  it("shows only selected media while pending detail keeps mutations inert", async () => {
    const hold = makeHold();
    respondWithNavigationItems(
      {
        [`GET /api/items/${LAST.itemId}`]: {
          status: 200,
          body: LAST,
          waitFor: hold.hold,
        },
      },
      [FIRST, LAST],
    );
    const { container } = renderItem(FIRST.itemId);
    await userEvent.click(await waitForNavigationReady());
    await waitFor(() => {
      expect(
        container.querySelector('[data-photo-surface="viewer"]'),
      ).toHaveAttribute("data-photo-item", LAST.itemId);
    });
    expect(
      container.querySelector(`[data-photo-item="${FIRST.itemId}"]`),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "React: Love" }).closest("[inert]"),
    ).not.toBeNull();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${FIRST.itemId}`, `/api/items/${LAST.itemId}`]);
    hold.letGo();
  });
});
describe("viewer navigation", () => {
  it("retries a failed neighbour read without counting another item open", async () => {
    respondWithNavigationItems({
      "POST /api/media/neighbors": {
        status: 503,
        body: { error: "unavailable", message: "Unavailable" },
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await screen.findByRole("button", { name: "Retry navigation" });
    respondWithNavigationItems();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry navigation" }),
    );
    await waitForNavigationReady();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([]);
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
  });
});
describe("viewer navigation", () => {
  it("abandons a delayed neighbor read after leaving the viewer", async () => {
    const hold = makeHold();
    respondWithNavigationItems({
      "POST /api/media/neighbors": {
        status: 200,
        body: { ahead: [], behind: [] },
        waitFor: hold.hold,
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitFor(() => {
      expect(recordedUrls()).toContain("/api/media/neighbors");
    });
    await userEvent.click(screen.getByRole("link", { name: /Back to/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    await act(async () => {
      hold.letGo();
      await hold.hold;
    });
    expect(router.state.location.pathname).toBe("/");
    expect(recordedUrls()).not.toContain(`/api/items/${MIDDLE.itemId}`);
  });
});
describe("viewer navigation", () => {
  it("ignores another move while the destination is loading", async () => {
    const hold = makeHold();
    respondWithNavigationItems({
      [`GET /api/items/${MIDDLE.itemId}`]: {
        status: 200,
        body: MIDDLE,
        waitFor: hold.hold,
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await userEvent.click(await waitForNavigationReady());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await userEvent.keyboard("hl{ArrowRight}{ArrowLeft}");
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    hold.letGo();
    await waitForNavigationReady();
  });
});
