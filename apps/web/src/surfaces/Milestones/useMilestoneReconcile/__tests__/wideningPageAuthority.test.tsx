import { makeHold } from "@/testing/itemWriteTestHelpers";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  waitForReconcileRows,
  WIDENING_SPAN,
} from "./reconcileTestHelpers";
type WideningReadState = {
  finish: (() => void) | undefined;
  hasHeldDetail: boolean;
  hasStartedDetail: boolean;
  hasChangedLaterPage: boolean;
  mismatchReads: number;
};
function _installHeldWideningReads(): WideningReadState {
  const { hold, letGo } = makeHold();
  const responseState: WideningReadState = {
    finish: letGo,
    hasHeldDetail: false,
    hasStartedDetail: false,
    hasChangedLaterPage: false,
    mismatchReads: 0,
  };

  const original = fetch;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (
        responseState.hasHeldDetail &&
        url === `/api/milestones/${detail.milestone.milestoneId}` &&
        !init?.method
      ) {
        responseState.hasStartedDetail = true;
        await hold;
      }
      if (url.includes("/mismatches")) {
        responseState.mismatchReads += 1;
        return new URL(url, "https://example.test").searchParams.has("cursor")
          ? new Response(
              JSON.stringify({
                milestone: detail.milestone,
                mismatches: [],
                nextCursor: null,
                wideningSpan: responseState.hasChangedLaterPage
                  ? { startsOn: "2026-08-30", endsOn: "2026-10-03" }
                  : WIDENING_SPAN,
              }),
            )
          : original(url, init);
      }
      return original(url, init);
    }),
  );
  return responseState;
}

function _beginHeldWidening({
  result,
  responses,
}: Readonly<{
  result: ReturnType<typeof renderReconcileController>["result"];
  responses: WideningReadState;
}>): void {
  act(() => {
    result.current.changeTarget({
      itemId: firstItemId,
      targetOn: "2026-09-18",
    });
  });
  responses.mismatchReads = 0;
  responses.hasHeldDetail = true;
  act(() => {
    result.current.widen();
  });
}
describe("widening authority across mismatch pages", () => {
  it("refuses widening when a successful later-page refresh changes aggregate extrema during held detail", async () => {
    const { result, client, page } = renderReconcileController();
    await waitForReconcileRows(result);
    page.body.nextCursor = "second";
    await act(async () => {
      await result.current.refresh();
    });
    const responses0 = _installHeldWideningReads();
    act(() => {
      return result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.isReading).toBe(false);
      expect(result.current.hasMore).toBe(false);
    });
    _beginHeldWidening({ result, responses: responses0 });
    await waitFor(() => {
      expect(responses0.hasStartedDetail).toBe(true);
      expect(responses0.mismatchReads).toBe(2);
      expect(
        client.getQueryState(result.current.mismatchesOptions.queryKey)
          ?.fetchStatus,
      ).toBe("idle");
    });
    responses0.hasChangedLaterPage = true;
    await act(async () => {
      await client.refetchQueries({
        queryKey: result.current.mismatchesOptions.queryKey,
      });
    });
    expect(responses0.mismatchReads).toBe(4);
    expect(result.current.wideningSpan).toEqual({
      startsOn: "2026-08-31",
      endsOn: "2026-10-02",
    });
    responses0.finish?.();
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
    expect(result.current.error).toMatch(/Refresh|changed/);
    expect(result.current.targets[firstItemId]).toBe("2026-09-18");
  });
});
