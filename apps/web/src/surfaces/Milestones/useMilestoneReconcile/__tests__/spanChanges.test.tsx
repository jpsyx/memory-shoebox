import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstItemId,
  getReconcileWritesFromRequests,
  renderReconcileController,
  waitForReconcileRows,
} from "./reconcileTestHelpers";
describe("span changes during reconciliation", () => {
  it("supplies the new sole target after a span becomes one day", async () => {
    const { result, detailAnswer, page } = renderReconcileController();
    await waitForReconcileRows(result);
    act(() => {
      return result.current.changeTarget({
        itemId: firstItemId,
        targetOn: "2026-09-18",
      });
    });
    detailAnswer.body = {
      ...detail,
      milestone: {
        ...detail.milestone,
        startsOn: "2026-09-20",
        endsOn: "2026-09-20",
      },
    };
    page.body.milestone = detailAnswer.body.milestone;
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      return expect(result.current.targets[firstItemId]).toBe("2026-09-20");
    });
  });
  it("blocks a successful changed detail read during held mismatch preflight", async () => {
    const { result, client, detailAnswer } = renderReconcileController();
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
    detailAnswer.body = {
      ...detail,
      milestone: { ...detail.milestone, endsOn: "2026-09-21" },
    };
    await client.refetchQueries({
      queryKey: result.current.detailQueryOptions.queryKey,
    });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  });
});

describe("whole-set widening authority", () => {
  it("requires review when the newly read whole-set widening span changed", async () => {
    const { result, page } = renderReconcileController();
    await waitForReconcileRows(result);
    page.body.wideningSpan = { startsOn: "2026-08-30", endsOn: "2026-10-02" };
    act(() => {
      return result.current.widen();
    });
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
    expect(result.current.error).toMatch(/changed/);
  });
  it("requires review when mismatch metadata reveals a span change after detail read", async () => {
    const { result, page } = renderReconcileController();
    await waitForReconcileRows(result);
    page.body.milestone = { ...page.body.milestone, endsOn: "2026-09-21" };
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(0);
  });
});
