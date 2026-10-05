import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  getRecordedLines,
  getRecordedRequests,
  stubFetch,
} from "@/testing/fetchStubHelpers";
import {
  makeHold,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRemovalActions } from ".././useRemovalActions";
import {
  DELETE,
  REQUEST,
  VIEWER,
  renderRemovalActionController,
} from "./renderRemovalActionController";
function _installKeepsAnUnavailableUncertainViewerWithdrawalIdleFetch0(): {
  request: RemovalRequestDto;
  calls: string[];
  viewer: Viewer;
} {
  const viewer = { ...VIEWER, role: "viewer" as const, isAdmin: false };
  const request = { ...REQUEST, media: null };
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        throw new TypeError("reply lost");
      }
      return Response.json(
        { error: "item_not_found", message: "Not available" },
        { status: 404 },
      );
    }),
  );
  return { request, calls, viewer };
}

it("blocks rapid confirmation and dismissal or switching during a write", async () => {
  const { hold, letGo } = makeHold();
  stubFetch({ [DELETE]: { body: undefined, status: 204, waitFor: hold } });
  const { result, queryClient, onItemDeleted } =
    renderRemovalActionController();
  act(() => {
    return result.current.openDelete(REQUEST);
  });
  act(() => {
    result.current.confirmDelete();
    result.current.confirmDelete();
    result.current.close();
    result.current.openDecline(
      makeRemovalRequestFromOverrides({ requestId: "other" }),
    );
  });
  expect(result.current.target?.requestId).toBe(REQUEST.requestId);
  await act(async () => {
    return letGo();
  });
  await waitForWritesToSettle(queryClient);
  expect(
    getRecordedRequests().filter(({ method }) => {
      return method === "DELETE";
    }),
  ).toHaveLength(1);
  expect(onItemDeleted).toHaveBeenCalledWith(REQUEST.itemId);
  expect(result.current.dialog).toBeUndefined();
});
it("sends nothing for a required whitespace reason", () => {
  stubFetch({});
  const { result } = renderRemovalActionController();
  act(() => {
    return result.current.openDecline(REQUEST);
  });
  act(() => {
    return result.current.confirmDecline(" \n ");
  });
  expect(getRecordedLines()).toEqual([]);
  expect(result.current.fieldErrors.declineReason).toBeTruthy();
});
it("retains an unsuccessful target and field errors", async () => {
  stubFetch({
    [`POST /api/removal-requests/${REQUEST.requestId}/decline`]: {
      status: 400,
      body: {
        error: "validation_error",
        message: "No",
        details: { fieldErrors: { declineReason: ["Too long"] } },
      },
    },
  });
  const { result, queryClient } = renderRemovalActionController();
  act(() => {
    return result.current.openDecline(REQUEST);
  });
  act(() => {
    return result.current.confirmDecline("Words");
  });
  await waitForWritesToSettle(queryClient);
  expect(result.current.target).toEqual(REQUEST);
  expect(result.current.fieldErrors.declineReason).toEqual(["Too long"]);
});
it("keeps an unavailable uncertain viewer withdrawal idle and blocks replay", async () => {
  const responses0 =
    _installKeepsAnUnavailableUncertainViewerWithdrawalIdleFetch0();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useRemovalActions({ viewer: responses0.viewer });
    },
  });
  act(() => {
    return result.current.withdraw(responses0.request);
  });
  await waitFor(() => {
    return expect(result.current.error).toMatch(/refresh/);
  });
  expect(result.current.isPending).toBe(false);
  act(() => {
    return result.current.withdraw(responses0.request);
  });
  await waitForWritesToSettle(queryClient);
  expect(
    responses0.calls.filter((line) => {
      return line.startsWith("POST");
    }),
  ).toHaveLength(1);
  expect(
    responses0.calls.every((line) => {
      return !line.endsWith("state=open");
    }),
  ).toBe(true);
});
it("prefers settled proof when independent queue reads straddle settlement", async () => {
  let numPosts = 0;
  const withdrawn = {
    ...REQUEST,
    state: "withdrawn" as const,
    canWithdraw: false,
    canDecline: false,
    canDeleteItem: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        numPosts += 1;
        throw new TypeError("reply lost");
      }
      const isSettled =
        new URL(url, "http://localhost").searchParams.get("state") ===
        "settled";
      return Response.json({
        removalRequests: [isSettled ? withdrawn : REQUEST],
        nextCursor: null,
        openCount: isSettled ? 0 : 1,
        settledCount: isSettled ? 1 : 0,
      });
    }),
  );
  const { result, queryClient } = renderRemovalActionController();
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  expect(result.current.target?.state).toBe("withdrawn");
  expect(result.current.target?.canWithdraw).toBe(false);
  act(() => {
    result.current.withdraw(REQUEST);
  });
  await waitForWritesToSettle(queryClient);
  expect(numPosts).toBe(1);
});
