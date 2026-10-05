import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  chooseReconcileTargets,
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  SECOND_ITEM_ID,
  waitForReconcileRows,
} from "./reconcileTestHelpers";
it.each(["transport", "json", "schema"] as const)(
  "keeps chosen dates and hides %s diagnostics when reconciliation preflight cannot read authority",
  async (failure) => {
    const { result } = renderReconcileController();
    await waitForReconcileRows(result);
    chooseReconcileTargets(result);
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.endsWith(detail.milestone.milestoneId)) {
          return originalFetch(url, init);
        }
        if (failure === "transport") {
          throw new TypeError("Internal transport diagnostic");
        }
        return failure === "json"
          ? new Response("Internal JSON diagnostic", { status: 200 })
          : Response.json({ internal: "Schema diagnostic" });
      }),
    );
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(result.current.error).toMatch(/dates are kept/i);
    });
    expect(result.current.error).not.toMatch(
      /diagnostic|invalid_type|unexpected|fetch/i,
    );
    expect(result.current.targets[firstItemId]).toBe("2026-09-18");
    expect(result.current.targets[SECOND_ITEM_ID]).toBe("2026-09-20");
    await waitFor(() => {
      return expect(result.current.isReading).toBe(false);
    });
    expect(result.current.hasReadError).toBe(true);
    expect(result.current.isPending).toBe(true);
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  },
);
