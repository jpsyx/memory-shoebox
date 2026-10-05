import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  rows,
  SECOND_ITEM_ID,
  VIEWER,
  waitForReconcileRows,
  WIDENING_SPAN,
} from "./reconcileTestHelpers";
function _installRetainsItemkeyedDatesThroughEmptyPagesAndFetch0(): void {
  const original = fetch;
  const extraRows = Array.from({ length: 600 }, (_, index) => {
    return {
      item: makeItemSummaryFromOverrides({
        itemId: `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`,
        capturedOn: "2026-08-31",
      }),
      attachedAt: "2026-10-04T12:00:00.000Z",
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/mismatches")) {
        const cursor = new URL(url, "https://example.test").searchParams.get(
          "cursor",
        );
        return new Response(
          JSON.stringify({
            milestone: detail.milestone,
            wideningSpan: WIDENING_SPAN,
            mismatches:
              cursor === "empty"
                ? []
                : cursor === "last"
                  ? [...rows, ...extraRows]
                  : rows,
            nextCursor:
              cursor === "empty" ? "last" : cursor === "last" ? null : "empty",
          }),
        );
      }
      return original(url, init);
    }),
  );
}

describe("reconciliation pagination and final authority", () => {
  it("supplies the sole one-day target explicitly", async () => {
    const { result, detailAnswer, page } = renderReconcileController();
    detailAnswer.body = {
      ...detail,
      milestone: { ...detail.milestone, endsOn: detail.milestone.startsOn },
    };
    page.body.milestone = detailAnswer.body.milestone;
    await waitForReconcileRows(result);
    await waitFor(() => {
      return expect(result.current.targets[firstItemId]).toBe("2026-09-18");
    });
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      return expect(getReconcileWritesFromRequests()).toHaveLength(1);
    });
    expect(getReconcileWritesFromRequests()[0]?.body).toEqual({
      mode: "move",
      moves: [
        { itemId: firstItemId, targetOn: "2026-09-18" },
        { itemId: SECOND_ITEM_ID, targetOn: "2026-09-18" },
      ],
    });
  });
  it("retains item-keyed dates through empty pages and duplicates, capping a batch at 500", async () => {
    const { result } = renderReconcileController();
    _installRetainsItemkeyedDatesThroughEmptyPagesAndFetch0();
    await waitForReconcileRows(result);
    await act(async () => {
      await result.current.refresh();
    });
    act(() => {
      return result.current.changeTarget({
        itemId: firstItemId,
        targetOn: "2026-09-18",
      });
    });
    act(() => {
      return result.current.loadMore();
    });
    await waitFor(() => {
      return expect(
        result.current.queryClient.getQueryData<{ pages: unknown[] }>(
          result.current.mismatchesOptions.queryKey,
        )?.pages,
      ).toHaveLength(2);
    });
    await waitFor(() => {
      return expect(result.current.isReading).toBe(false);
    });
    act(() => {
      return result.current.loadMore();
    });
    await waitFor(() => {
      return expect(result.current.strays).toHaveLength(500);
    });
    expect(result.current.targets[firstItemId]).toBe("2026-09-18");
    expect(result.current.hasMore).toBe(false);
    expect(
      new Set(
        result.current.strays.map(({ itemId }) => {
          return itemId;
        }),
      ).size,
    ).toBe(500);
  });
  it("blocks the final write when detail fails during held mismatch preflight", async () => {
    const { result, client } = renderReconcileController();
    await waitForReconcileRows(result);
    const original = fetch;
    let finish: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      finish = settle;
    });
    let hasFailedDetail = false;
    let hasStartedMismatch = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/mismatches")) {
          hasStartedMismatch = true;
          await held;
        }
        return hasFailedDetail &&
          url === `/api/milestones/${detail.milestone.milestoneId}`
          ? new Response(
              JSON.stringify({
                error: "service_unavailable",
                message: "Offline",
              }),
              { status: 503 },
            )
          : original(url, init);
      }),
    );
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(hasStartedMismatch).toBe(true);
    });
    hasFailedDetail = true;
    await client.refetchQueries({
      queryKey: result.current.detailQueryOptions.queryKey,
    });
    finish?.();
    await waitFor(() => {
      return expect(result.current.error).toMatch(/Refresh/);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  });
  it("prevents a pending old identity from writing after member changes", async () => {
    const { result, rerender } = renderReconcileController();
    await waitForReconcileRows(result);
    const original = fetch;
    let finish: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      finish = settle;
    });
    let hasStarted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/mismatches")) {
          hasStarted = true;
          await held;
        }
        return original(url, init);
      }),
    );
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(hasStarted).toBe(true);
    });
    rerender({ detail, viewer: { ...VIEWER, memberId: "member-two" } });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isReading).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  });
});
