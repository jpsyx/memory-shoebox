import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  viewer,
  firstId,
  secondId,
  renderReconcileController,
  waitForReconcileRows,
  getReconcileWritesFromRequests,
} from "./reconcileTestHelpers";

describe("latest mismatch authority at the write boundary", () => {
  it.each(["widen", "move"] as const)(
    "refuses %s after completed mismatch preflight is superseded while detail is held",
    async (action) => {
      const { result, client, page } = renderReconcileController();
      await waitForReconcileRows(result);
      act(() => {
        result.current.changeTarget({
          itemId: firstId,
          targetOn: "2026-09-18",
        });
        result.current.changeTarget({
          itemId: secondId,
          targetOn: "2026-09-20",
        });
      });
      const original = fetch;
      let finish: (() => void) | undefined;
      const held = new Promise<void>((settle) => {
        finish = settle;
      });
      let hasStartedDetail = false;
      let mismatchReads = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (
            url === `/api/milestones/${detail.milestone.milestoneId}` &&
            !init?.method
          ) {
            hasStartedDetail = true;
            await held;
          }
          if (url.includes("/mismatches")) {
            mismatchReads += 1;
          }
          return original(url, init);
        }),
      );
      act(() => {
        return result.current[action]();
      });
      await waitFor(() => {
        expect(hasStartedDetail).toBe(true);
        expect(mismatchReads).toBe(1);
        expect(
          client.getQueryState(result.current.mismatchesOptions.queryKey)
            ?.fetchStatus,
        ).toBe("idle");
      });
      if (action === "widen") {
        page.body.wideningSpan = {
          startsOn: "2026-08-30",
          endsOn: "2026-10-03",
        };
      } else {
        page.body.mismatches = page.body.mismatches.filter(({ item }) => {
          return item.itemId !== firstId;
        });
      }
      await act(async () => {
        await client.refetchQueries({
          queryKey: result.current.mismatchesOptions.queryKey,
        });
      });
      expect(mismatchReads).toBe(2);
      expect(getReconcileWritesFromRequests()).toHaveLength(0);
      finish?.();
      await waitFor(() => {
        return expect(result.current.isPending).toBe(false);
      });
      expect(getReconcileWritesFromRequests()).toHaveLength(0);
      expect(result.current.error).toMatch(/Refresh|changed/);
      expect(result.current.targets[firstId]).toBe("2026-09-18");
      expect(result.current.targets[secondId]).toBe("2026-09-20");
    },
  );
});

describe("reconciliation recovery and operation ownership schedules", () => {
  it("keeps failed uncertain recovery blocked until explicit refresh and a deliberate action", async () => {
    const { result, answer, detailAnswer, page } = renderReconcileController(
      {},
    );
    await waitForReconcileRows(result);
    act(() => {
      result.current.changeTarget({ itemId: firstId, targetOn: "2026-09-18" });
      result.current.changeTarget({ itemId: secondId, targetOn: "2026-09-20" });
    });
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          detailAnswer.status = 503;
          page.status = 503;
        }
        return original(url, init);
      }),
    );
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      expect(result.current.error).toMatch(/could not be confirmed/);
      expect(result.current.hasReadError).toBe(true);
      expect(result.current.isReading).toBe(false);
    });
    expect(result.current.targets[firstId]).toBe("2026-09-18");
    expect(result.current.targets[secondId]).toBe("2026-09-20");
    act(() => {
      return result.current.move();
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
    vi.stubGlobal("fetch", original);
    detailAnswer.status = 200;
    page.status = 200;
    answer.body = {
      ...detail,
      movedCount: 2,
      acknowledgedCount: 0,
      raisedElsewhere: [],
    };
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      return expect(result.current.result).toBe("2 moved; 0 left as they are.");
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(2);
    expect(getReconcileWritesFromRequests()[1]?.body).toEqual({
      mode: "move",
      moves: [
        { itemId: firstId, targetOn: "2026-09-18" },
        { itemId: secondId, targetOn: "2026-09-20" },
      ],
    });
  });

  it("withholds the old confirmation and onward occasions after member changes during a started write", async () => {
    const { result, rerender, answer } = renderReconcileController({
      ...detail,
      movedCount: 0,
      acknowledgedCount: 2,
      raisedElsewhere: [
        {
          milestone: { ...detail.milestone, name: "Old onward occasion" },
          mismatchCount: 7,
        },
      ],
    });
    await waitForReconcileRows(result);
    let finish: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      finish = settle;
    });
    answer.waitFor = held;
    act(() => {
      return result.current.acknowledge();
    });
    await waitFor(() => {
      return expect(getReconcileWritesFromRequests()).toHaveLength(1);
    });
    rerender({ detail, viewer: { ...viewer, memberId: "member-two" } });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(result.current.result).toBeUndefined();
    expect(result.current.raisedElsewhere).toEqual([]);
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
  });
});
