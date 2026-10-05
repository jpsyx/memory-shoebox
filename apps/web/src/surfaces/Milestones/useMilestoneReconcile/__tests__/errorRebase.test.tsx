import type {
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  chooseReconcileTargets,
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  waitForReconcileRows,
} from "./reconcileTestHelpers";
function _installRebasesARejectedDateWhenAuthoritativeRecoveryFetch0({
  detailAnswer,
  page,
}: Readonly<{
  detailAnswer: { body: MilestoneDetail; status: number };
  page: { body: ListMilestoneMismatchesResponse; status: number };
}>): void {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        detailAnswer.body = {
          ...detail,
          milestone: {
            ...detail.milestone,
            startsOn: "2026-09-20",
            endsOn: "2026-09-20",
          },
        };
        page.body.milestone = detailAnswer.body.milestone;
      }
      return original(url, init);
    }),
  );
}

describe("changed one-day server errors", () => {
  it("rebases a rejected date when authoritative recovery supplies a new sole day", async () => {
    const { result, answer, detailAnswer, page } = renderReconcileController();
    await waitForReconcileRows(result);
    answer.status = 400;
    answer.body = {
      error: "validation_error",
      message: "Outside span",
      details: {
        fieldErrors: { "moves.0.targetOn": ["Choose an occasion day"] },
      },
    };
    chooseReconcileTargets(result);
    _installRebasesARejectedDateWhenAuthoritativeRecoveryFetch0({
      detailAnswer,
      page,
    });
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      return expect(result.current.targets[firstItemId]).toBe("2026-09-20");
    });
    expect(result.current.fieldErrors[firstItemId]).toBeUndefined();
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
  });
});
