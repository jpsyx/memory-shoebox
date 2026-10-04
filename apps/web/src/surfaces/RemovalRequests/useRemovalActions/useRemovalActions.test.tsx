import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtures";
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
import { useRemovalActions } from "./useRemovalActions";
const VIEWER = {
  memberId: "member",
  displayName: "Mamá",
  role: "admin",
  isAdmin: true,
} as const;
const REQUEST = makeRemovalRequestFromOverrides({
  canDeleteItem: true,
  canDecline: true,
});
const DELETE = `DELETE /api/items/${REQUEST.itemId}`;
const DECLINE = `POST /api/removal-requests/${REQUEST.requestId}/decline`;
function _render(onItemDeleted = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const hook = renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useRemovalActions({ viewer: VIEWER, onItemDeleted });
    },
  });
  return { ...hook, queryClient, onItemDeleted };
}
describe("removal action authority", () => {
  it("blocks rapid confirmation and dismissal or switching during a write", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({ [DELETE]: { body: undefined, status: 204, waitFor: hold } });
    const { result, queryClient, onItemDeleted } = _render();
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
    const { result } = _render();
    act(() => {
      return result.current.openDecline(REQUEST);
    });
    act(() => {
      return result.current.confirmDecline(" \n ");
    });
    expect(getRecordedLines()).toEqual([]);
    expect(result.current.fieldErrors.declineReason).toBeTruthy();
  });
  it("marks item details stale without reading them and invalidates both queue tabs", async () => {
    stubFetch({ [DELETE]: { body: undefined, status: 204 } });
    const { result, queryClient } = _render();
    const openKey = [
      "removal-requests",
      "queue",
      VIEWER.memberId,
      "state=open",
    ];
    const settledKey = [
      "removal-requests",
      "queue",
      VIEWER.memberId,
      "state=settled",
    ];
    queryClient.setQueryData(openKey, {});
    queryClient.setQueryData(settledKey, {});
    queryClient.setQueryData(["items", REQUEST.itemId], {});
    act(() => {
      return result.current.openDelete(REQUEST);
    });
    act(() => {
      return result.current.confirmDelete();
    });
    await waitForWritesToSettle(queryClient);
    expect(queryClient.getQueryState(openKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(settledKey)?.isInvalidated).toBe(true);
    expect(getRecordedLines()).toEqual([DELETE]);
  });
  it("refreshes authoritative request state after response loss before allowing retry, without repeating the write", async () => {
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
    const { result, queryClient } = _render();
    act(() => {
      return result.current.openDecline(REQUEST);
    });
    act(() => {
      return result.current.confirmDecline("Our words");
    });
    await waitFor(() => {
      return expect(reads.length).toBeGreaterThan(0);
    });
    expect(result.current.isPending).toBe(true);
    act(() => {
      return result.current.confirmDecline("Our words");
    });
    await act(async () => {
      return letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => {
        return init?.method === "POST";
      }),
    ).toHaveLength(1);
    expect(result.current.error).toMatch(/review|try again/i);
    expect(
      reads.every((url) => {
        return !url.match(/\/items\/[^/]+$/);
      }),
    ).toBe(true);
  });
  it("retains an unsuccessful target and field errors", async () => {
    stubFetch({
      [DECLINE]: {
        status: 400,
        body: {
          error: "validation_error",
          message: "No",
          details: { fieldErrors: { declineReason: ["Too long"] } },
        },
      },
    });
    const { result, queryClient } = _render();
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useRemovalActions({ viewer });
      },
    });
    act(() => {
      return result.current.withdraw(request);
    });
    await waitFor(() => {
      return expect(result.current.error).toMatch(/refresh/);
    });
    expect(result.current.isPending).toBe(false);
    act(() => {
      return result.current.withdraw(request);
    });
    await waitForWritesToSettle(queryClient);
    expect(
      calls.filter((line) => {
        return line.startsWith("POST");
      }),
    ).toHaveLength(1);
    expect(
      calls.every((line) => {
        return !line.endsWith("state=open");
      }),
    ).toBe(true);
  });
  it("keeps an old viewer result out of a newer viewer's target and queue", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({ [DELETE]: { body: undefined, status: 204, waitFor: hold } });
    let viewer: import("@/session/requireSignedIn/requireSignedIn").Viewer = {
      ...VIEWER,
    };
    const queryClient = new QueryClient();
    const onDeleted = vi.fn();
    const { result, rerender } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useRemovalActions({ viewer, onItemDeleted: onDeleted });
      },
    });
    act(() => {
      return result.current.openDelete(REQUEST);
    });
    act(() => {
      return result.current.confirmDelete();
    });
    viewer = { ...VIEWER, memberId: "another-viewer" };
    rerender();
    const anotherRequest = { ...REQUEST, requestId: "another-request" };
    act(() => {
      return result.current.openDecline(anotherRequest);
    });
    expect(result.current.target?.requestId).toBe(anotherRequest.requestId);
    await act(async () => {
      return letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(result.current.dialog).toBe("decline");
    expect(result.current.target?.requestId).toBe(anotherRequest.requestId);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(
      queryClient.getQueriesData({
        queryKey: ["removal-requests", "queue", viewer.memberId],
      }),
    ).toEqual([]);
  });
  it("reads advancing authoritative pages before letting a settled request be retried", async () => {
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
    const { result, queryClient } = _render();
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
      calls.filter((line) => {
        return line.startsWith("POST");
      }),
    ).toHaveLength(1);
    expect(
      calls.some((line) => {
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
    const { result, queryClient } = _render();
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
});
