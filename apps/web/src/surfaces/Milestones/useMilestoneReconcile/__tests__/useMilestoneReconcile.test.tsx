import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  SECOND_ITEM_ID,
  waitForReconcileRows,
  WIDENING_SPAN,
} from ".././__tests__/reconcileTestHelpers";
import { chooseReconcileTargets } from "./reconcileTestHelpers";
describe("saved reconciliation authority", () => {
  it("requires all explicit span dates and blocks duplicate presses", async () => {
    const { result } = renderReconcileController();
    await waitForReconcileRows(result);
    act(() => {
      return result.current.move();
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
    chooseReconcileTargets(result);
    act(() => {
      result.current.move();
      result.current.move();
    });
    await waitFor(() => {
      return expect(getReconcileWritesFromRequests()).toHaveLength(1);
    });
    expect(getReconcileWritesFromRequests()[0]?.body).toEqual({
      mode: "move",
      moves: [
        { itemId: firstItemId, targetOn: "2026-09-18" },
        { itemId: SECOND_ITEM_ID, targetOn: "2026-09-20" },
      ],
    });
  });
  it.each(["acknowledge", "widen"] as const)(
    "%s uses the correct batch/full-set body",
    async (action) => {
      const { result } = renderReconcileController();
      await waitForReconcileRows(result);
      act(() => {
        return result.current[action]();
      });
      await waitFor(() => {
        return expect(getReconcileWritesFromRequests()).toHaveLength(1);
      });
      expect(getReconcileWritesFromRequests()[0]?.body).toEqual(
        action === "widen"
          ? WIDENING_SPAN
          : { mode: "acknowledge", itemIds: [firstItemId, SECOND_ITEM_ID] },
      );
    },
  );
  it("maps dotted errors to original IDs, retains targets and blocks unchanged retry", async () => {
    const { result, answer } = renderReconcileController();
    await waitForReconcileRows(result);
    answer.status = 400;
    answer.body = {
      error: "validation_error",
      message: "Outside span",
      details: {
        fieldErrors: { "moves.1.targetOn": ["Choose an occasion day"] },
      },
    };
    chooseReconcileTargets(result);
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      return expect(result.current.fieldErrors[SECOND_ITEM_ID]).toBe(
        "Choose an occasion day",
      );
    });
    expect(result.current.targets[SECOND_ITEM_ID]).toBe("2026-09-20");
    act(() => {
      return result.current.move();
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
  });
  it("refreshes unconfirmed responses without automatic replay", async () => {
    const { result, page, detailAnswer } = renderReconcileController({});
    await waitForReconcileRows(result);
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          page.body = {
            milestone: detail.milestone,
            mismatches: [],
            wideningSpan: WIDENING_SPAN,
            nextCursor: null,
          };
          detailAnswer.body = { ...detail, mismatchCount: 0 };
        }
        return original(url, init);
      }),
    );
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(result.current.detail.mismatchCount).toBe(0);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
    expect(result.current.error).toMatch(/could not be confirmed/);
  });
  it("refuses changed span or attachment after refreshing authority", async () => {
    const { result, detailAnswer } = renderReconcileController();
    await waitForReconcileRows(result);
    detailAnswer.body = {
      ...detail,
      milestone: { ...detail.milestone, endsOn: "2026-09-21" },
    };
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(result.current.error).toMatch(/changed/);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  });
});
