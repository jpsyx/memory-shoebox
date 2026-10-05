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
  makeMovedResponseFromDetail,
  renderReconcileController,
  SECOND_ITEM_ID,
  VIEWER,
  waitForReconcileRows,
} from "./reconcileTestHelpers";
function _installHeldDetailDuringMismatchPreflight(): {
  finish: (() => void) | undefined;
  hasStartedDetail: boolean;
  mismatchReads: number;
} {
  const responseState: {
    finish: (() => void) | undefined;
    hasStartedDetail: boolean;
    mismatchReads: number;
  } = { finish: undefined, hasStartedDetail: false, mismatchReads: 0 };

  const original = fetch;

  const held = new Promise<void>((settle) => {
    responseState.finish = settle;
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url === `/api/milestones/${detail.milestone.milestoneId}` &&
        !init?.method
      ) {
        responseState.hasStartedDetail = true;
        await held;
      }
      if (url.includes("/mismatches")) {
        responseState.mismatchReads += 1;
      }
      return original(url, init);
    }),
  );
  return responseState;
}

function _installKeepsFailedUncertainRecoveryBlockedUntilExplicitFetch1({
  detailAnswer,
  page,
}: Readonly<{
  detailAnswer: { body: MilestoneDetail; status: number };
  page: { body: ListMilestoneMismatchesResponse; status: number };
}>): {
  original: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  };
} {
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
  return { original };
}

async function _restoreAuthority({
  controller,
  original,
}: Readonly<{
  controller: Readonly<ReturnType<typeof renderReconcileController>>;
  original: typeof fetch;
}>): Promise<void> {
  vi.stubGlobal("fetch", original);
  controller.detailAnswer.status = 200;
  controller.page.status = 200;
  controller.answer.body = makeMovedResponseFromDetail(detail);
  await act(async () => {
    await controller.result.current.refresh();
  });
}
describe("latest mismatch authority at the write boundary", () => {
  it.each(["widen", "move"] as const)(
    "refuses %s after completed mismatch preflight is superseded while detail is held",
    async (action) => {
      const { result, client, page } = renderReconcileController();
      await waitForReconcileRows(result);
      chooseReconcileTargets(result);
      const responses0 = _installHeldDetailDuringMismatchPreflight();
      act(() => {
        return result.current[action]();
      });
      await waitFor(() => {
        expect(responses0.hasStartedDetail).toBe(true);
        expect(responses0.mismatchReads).toBe(1);
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
          return item.itemId !== firstItemId;
        });
      }
      await act(async () => {
        await client.refetchQueries({
          queryKey: result.current.mismatchesOptions.queryKey,
        });
      });
      expect(responses0.mismatchReads).toBe(2);
      expect(getReconcileWritesFromRequests()).toHaveLength(0);
      responses0.finish?.();
      await waitFor(() => {
        return expect(result.current.isPending).toBe(false);
      });
      expect(getReconcileWritesFromRequests()).toHaveLength(0);
      expect(result.current.error).toMatch(/Refresh|changed/);
      expect(result.current.targets[firstItemId]).toBe("2026-09-18");
      expect(result.current.targets[SECOND_ITEM_ID]).toBe("2026-09-20");
    },
  );
});

describe("reconciliation recovery and operation ownership schedules", () => {
  it("keeps failed uncertain recovery blocked until explicit refresh and a deliberate action", async () => {
    const controller = renderReconcileController({});
    const { result, detailAnswer, page } = controller;
    await waitForReconcileRows(result);
    chooseReconcileTargets(result);
    const responses1 =
      _installKeepsFailedUncertainRecoveryBlockedUntilExplicitFetch1({
        detailAnswer,
        page,
      });
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      expect(result.current.error).toMatch(/could not be confirmed/);
      expect(result.current.hasReadError).toBe(true);
      expect(result.current.isReading).toBe(false);
    });
    expect(result.current.targets[firstItemId]).toBe("2026-09-18");
    expect(result.current.targets[SECOND_ITEM_ID]).toBe("2026-09-20");
    act(() => {
      return result.current.move();
    });
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
    await _restoreAuthority({ controller, original: responses1.original });
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
        { itemId: firstItemId, targetOn: "2026-09-18" },
        { itemId: SECOND_ITEM_ID, targetOn: "2026-09-20" },
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
    rerender({ detail, viewer: { ...VIEWER, memberId: "member-two" } });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isPending).toBe(false);
    });
    expect(result.current.result).toBeUndefined();
    expect(result.current.raisedElsewhere).toEqual([]);
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
  });
});
