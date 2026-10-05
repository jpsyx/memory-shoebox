import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstId,
  wideningSpan,
  renderReconcileController,
  waitForReconcileRows,
  getReconcileWritesFromRequests,
} from "./reconcileTestHelpers";

describe("widening authority across mismatch pages", () => {
  it("refuses widening when a successful later-page refresh changes aggregate extrema during held detail", async () => {
    const { result, client, page } = renderReconcileController();
    await waitForReconcileRows(result);
    page.body.nextCursor = "second";
    await act(async () => {
      await result.current.refresh();
    });
    const original = fetch;
    let finish: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      finish = settle;
    });
    let hasHeldDetail = false;
    let hasStartedDetail = false;
    let hasChangedLaterPage = false;
    let mismatchReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (
          hasHeldDetail &&
          url === `/api/milestones/${detail.milestone.milestoneId}` &&
          !init?.method
        ) {
          hasStartedDetail = true;
          await held;
        }
        if (url.includes("/mismatches")) {
          mismatchReads += 1;
          if (new URL(url, "https://example.test").searchParams.has("cursor")) {
            return new Response(
              JSON.stringify({
                milestone: detail.milestone,
                mismatches: [],
                nextCursor: null,
                wideningSpan: hasChangedLaterPage
                  ? { startsOn: "2026-08-30", endsOn: "2026-10-03" }
                  : wideningSpan,
              }),
            );
          }
        }
        return original(url, init);
      }),
    );
    act(() => {
      return result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.isReading).toBe(false);
      expect(result.current.hasMore).toBe(false);
    });
    act(() => {
      return result.current.changeTarget({
        itemId: firstId,
        targetOn: "2026-09-18",
      });
    });
    mismatchReads = 0;
    hasHeldDetail = true;
    act(() => {
      return result.current.widen();
    });
    await waitFor(() => {
      expect(hasStartedDetail).toBe(true);
      expect(mismatchReads).toBe(2);
      expect(
        client.getQueryState(result.current.mismatchesOptions.queryKey)
          ?.fetchStatus,
      ).toBe("idle");
    });
    hasChangedLaterPage = true;
    await act(async () => {
      await client.refetchQueries({
        queryKey: result.current.mismatchesOptions.queryKey,
      });
    });
    expect(mismatchReads).toBe(4);
    expect(result.current.wideningSpan).toEqual({
      startsOn: "2026-08-31",
      endsOn: "2026-10-02",
    });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
    expect(result.current.error).toMatch(/Refresh|changed/);
    expect(result.current.targets[firstId]).toBe("2026-09-18");
  });
});
