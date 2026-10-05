import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  makeHold,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRemovalActions } from ".././useRemovalActions";
import {
  REQUEST,
  renderRemovalActionController,
} from "./renderRemovalActionController";
function _installRefreshesAuthoritativeRequestStateAfterResponseLossFetch0(): {
  reads: string[];
  letGo: () => void;
} {
  const reads: string[] = [];
  const { hold, letGo } = makeHold();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        throw new TypeError("lost reply");
      }
      reads.push(url);
      await hold;
      return Response.json({
        removalRequests: [REQUEST],
        nextCursor: null,
        openCount: 1,
        settledCount: 0,
      });
    }),
  );
  return { reads, letGo };
}

function _installFindsSettledAuthorityOnALaterPageFetch1(): {
  calls: string[];
} {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        throw new TypeError("reply lost");
      }
      const params = new URL(url, "http://localhost").searchParams;
      const isSettled = params.get("state") === "settled";
      const isLater = params.has("cursor");
      return Response.json({
        removalRequests:
          isLater && isSettled
            ? [
                {
                  ...REQUEST,
                  state: "declined",
                  canDecline: false,
                  canWithdraw: false,
                  canDeleteItem: false,
                },
              ]
            : [],
        nextCursor: isLater ? null : "opaque",
        openCount: 0,
        settledCount: 1,
      });
    }),
  );
  return { calls };
}

type WithdrawalRecoveryState = {
  reads: string[];
  numPosts: number;
  viewer: Viewer;
};
function _installWithdrawalRecovery(): WithdrawalRecoveryState {
  const responseState: Pick<WithdrawalRecoveryState, "numPosts"> = {
    numPosts: 0,
  };

  const viewer = {
    memberId: REQUEST.requestedBy.memberId,
    displayName: REQUEST.requestedBy.displayName,
    role: "uploader" as const,
    isAdmin: false,
  };
  const reads: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        responseState.numPosts += 1;
        if (responseState.numPosts === 1) {
          throw new TypeError("reply lost");
        }
        return Response.json({
          ...REQUEST,
          state: "withdrawn",
          canWithdraw: false,
        });
      }
      reads.push(url);
      return url.includes(`/items/${REQUEST.itemId}/removal-requests`)
        ? Response.json({
            item: makeItemSummaryFromOverrides(),
            removalRequests: [REQUEST],
            nextCursor: null,
            canRequestRemoval: false,
          })
        : Response.json({
            removalRequests: [],
            nextCursor: null,
            openCount: 0,
            settledCount: 0,
          });
    }),
  );
  return Object.assign(responseState, { reads, viewer });
}

it("refreshes authoritative request state after response loss before allowing retry, without repeating the write", async () => {
  const responses0 =
    _installRefreshesAuthoritativeRequestStateAfterResponseLossFetch0();
  const { result, queryClient } = renderRemovalActionController();
  act(() => {
    return result.current.openDecline(REQUEST);
  });
  act(() => {
    return result.current.confirmDecline("Our words");
  });
  await waitFor(() => {
    return expect(responses0.reads.length).toBeGreaterThan(0);
  });
  expect(result.current.isPending).toBe(true);
  act(() => {
    return result.current.confirmDecline("Our words");
  });
  await act(async () => {
    return responses0.letGo();
  });
  await waitForWritesToSettle(queryClient);
  expect(
    vi.mocked(fetch).mock.calls.filter(([, init]) => {
      return init?.method === "POST";
    }),
  ).toHaveLength(1);
  expect(result.current.error).toMatch(/review|try again/i);
  expect(
    responses0.reads.every((url) => {
      return !url.match(/\/items\/[^/]+$/);
    }),
  ).toBe(true);
});
it("finds settled authority on a later page and blocks another write", async () => {
  const responses1 = _installFindsSettledAuthorityOnALaterPageFetch1();
  const { result, queryClient } = renderRemovalActionController();
  act(() => {
    return result.current.openDecline(REQUEST);
  });
  act(() => {
    return result.current.confirmDecline("Words");
  });
  await waitForWritesToSettle(queryClient);
  expect(result.current.target?.state).toBe("declined");
  act(() => {
    return result.current.confirmDecline("Words");
  });
  expect(
    responses1.calls.filter((line) => {
      return line.startsWith("POST");
    }),
  ).toHaveLength(1);
  expect(
    responses1.calls.some((line) => {
      return line.includes("cursor=opaque");
    }),
  ).toBe(true);
});
it("never replays a stale withdrawal DTO after authority confirms it settled", async () => {
  let numPosts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        numPosts += 1;
        throw new TypeError("reply lost");
      }
      return Response.json({
        removalRequests: [
          {
            ...REQUEST,
            state: "withdrawn",
            canWithdraw: false,
            canDecline: false,
            canDeleteItem: false,
          },
        ],
        nextCursor: null,
        openCount: 0,
        settledCount: 1,
      });
    }),
  );
  const { result, queryClient } = renderRemovalActionController();
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  expect(numPosts).toBe(1);
});
it("reconciles an uploader requester's withdrawal of another uploader's item from accessible history", async () => {
  const responses2 = _installWithdrawalRecovery();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useRemovalActions({ viewer: responses2.viewer });
    },
  });
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  expect(result.current.target?.state).toBe("open");
  expect(responses2.reads).toContain(
    `/api/items/${REQUEST.itemId}/removal-requests`,
  );
  expect(
    responses2.reads.some((url) => {
      return url.startsWith("/api/removal-requests");
    }),
  ).toBe(false);
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  expect(responses2.numPosts).toBe(2);
});
