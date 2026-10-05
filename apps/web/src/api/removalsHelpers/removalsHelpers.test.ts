import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import type {
  ListRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createRemovalRequest,
  declineRemovalRequest,
  withdrawRemovalRequest,
} from "./removalsHelpers";
import {
  makeItemRemovalRequestsQueryOptionsFromIdentity,
  makeRemovalRequestsInfiniteQueryOptionsFromQueueScope,
} from "./removalsQueryHelpers";
const REQUEST = makeRemovalRequestFromOverrides() satisfies RemovalRequestDto;
const QUEUE = {
  removalRequests: [REQUEST],
  nextCursor: null,
  openCount: 1,
  settledCount: 0,
} satisfies ListRemovalRequestsResponse;

function _makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("removal route contracts", () => {
  it("asks with normalized own words at an encoded item path", async () => {
    stubFetch({
      "POST /api/items/a%2Fb%20%3F/removal-requests": {
        status: 201,
        body: REQUEST,
      },
    });
    await expect(
      createRemovalRequest({ itemId: "a/b ?", body: { reason: "  " } }),
    ).resolves.toEqual(REQUEST);
    expect(getRecordedRequests()).toEqual([
      {
        method: "POST",
        url: "/api/items/a%2Fb%20%3F/removal-requests",
        body: { reason: null },
      },
    ]);
  });
  it("declines with trimmed compulsory words", async () => {
    stubFetch({
      "POST /api/removal-requests/a%2Fb%20%3F/decline": {
        status: 200,
        body: REQUEST,
      },
    });
    await declineRemovalRequest({
      requestId: "a/b ?",
      body: { declineReason: "  My words  " },
    });
    expect(getRecordedRequests()).toEqual([
      {
        method: "POST",
        url: "/api/removal-requests/a%2Fb%20%3F/decline",
        body: { declineReason: "My words" },
      },
    ]);
    expect(() => {
      return declineRemovalRequest({
        requestId: "id",
        body: { declineReason: " " },
      });
    }).toThrowError(/Too small/);
    expect(getRecordedRequests()).toHaveLength(1);
  });
  it("withdraws without a JSON body and returns the settled request", async () => {
    const withdrawnRequest = makeRemovalRequestFromOverrides({
      state: "withdrawn",
      canWithdraw: false,
      resolvedAt: "2026-10-04T13:00:00.000Z",
      resolvedBy: REQUEST.requestedBy,
    });
    stubFetch({
      "POST /api/removal-requests/a%2Fb%20%3F/withdraw": {
        status: 200,
        body: withdrawnRequest,
      },
    });
    await expect(withdrawRemovalRequest("a/b ?")).resolves.toEqual(
      withdrawnRequest,
    );
    expect(getRecordedRequests()).toEqual([
      {
        method: "POST",
        url: "/api/removal-requests/a%2Fb%20%3F/withdraw",
        body: undefined,
      },
    ]);
  });
  it("reads item requests without counting an item open", async () => {
    const response = {
      removalRequests: [REQUEST],
      nextCursor: null,
      item: makeItemSummaryFromOverrides(),
      canRequestRemoval: false,
    };
    stubFetch({
      "GET /api/items/a%2Fb%20%3F/removal-requests": {
        status: 200,
        body: response,
      },
    });
    await expect(
      _makeClient().fetchQuery(
        makeItemRemovalRequestsQueryOptionsFromIdentity({
          memberId: "member",
          itemId: "a/b ?",
        }),
      ),
    ).resolves.toEqual(response);
    expect(getRecordedRequests()).toEqual([
      {
        method: "GET",
        url: "/api/items/a%2Fb%20%3F/removal-requests",
        body: undefined,
      },
    ]);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
  });
  it("reads the selected queue tab", async () => {
    stubFetch({ "GET /api/removal-requests": { status: 200, body: QUEUE } });
    const result = await _makeClient().fetchInfiniteQuery(
      makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
        memberId: "member",
        state: "settled",
      }),
    );
    expect(result.pages[0]).toEqual(QUEUE);
    expect(getRecordedRequests()).toEqual([
      {
        method: "GET",
        url: "/api/removal-requests?state=settled",
        body: undefined,
      },
    ]);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
  });
  it("keeps member, item and queue tab identities separate", () => {
    const first = makeItemRemovalRequestsQueryOptionsFromIdentity({
      memberId: "one",
      itemId: "item",
    }).queryKey;
    expect(first).not.toEqual(
      makeItemRemovalRequestsQueryOptionsFromIdentity({
        memberId: "two",
        itemId: "item",
      }).queryKey,
    );
    expect(first).not.toEqual(
      makeItemRemovalRequestsQueryOptionsFromIdentity({
        memberId: "one",
        itemId: "other",
      }).queryKey,
    );
    const open = makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
      memberId: "one",
      state: "open",
    }).queryKey;
    expect(open).not.toEqual(
      makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
        memberId: "two",
        state: "open",
      }).queryKey,
    );
    expect(open).not.toEqual(
      makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
        memberId: "one",
        state: "settled",
      }).queryKey,
    );
  });
  it("follows an empty queue page's opaque cursor and ends only at null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...QUEUE, removalRequests: [], nextCursor: "id /+?" }),
      )
      .mockResolvedValueOnce(Response.json(QUEUE));
    vi.stubGlobal("fetch", fetchMock);
    const options = makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
      memberId: "one",
      state: "open",
    });
    const result = await _makeClient().fetchInfiniteQuery({
      ...options,
      pages: 3,
    });
    expect(result.pages).toHaveLength(2);
    expect(
      fetchMock.mock.calls.map(([url]) => {
        return url;
      }),
    ).toEqual([
      "/api/removal-requests?state=open",
      "/api/removal-requests?state=open&cursor=id+%2F%2B%3F",
    ]);
  });
  it.each(["create", "decline", "withdraw", "item", "queue"] as const)(
    "rejects malformed %s responses",
    async (operation) => {
      stubFetch({
        "POST /api/items/id/removal-requests": { status: 201, body: {} },
        "POST /api/removal-requests/id/decline": { status: 200, body: {} },
        "POST /api/removal-requests/id/withdraw": { status: 200, body: {} },
        "GET /api/items/id/removal-requests": { status: 200, body: {} },
        "GET /api/removal-requests": { status: 200, body: {} },
      });
      const operations = {
        create: () => {
          return createRemovalRequest({ itemId: "id", body: { reason: null } });
        },
        decline: () => {
          return declineRemovalRequest({
            requestId: "id",
            body: { declineReason: "Words" },
          });
        },
        withdraw: () => {
          return withdrawRemovalRequest("id");
        },
        item: () => {
          return _makeClient().fetchQuery(
            makeItemRemovalRequestsQueryOptionsFromIdentity({
              memberId: "one",
              itemId: "id",
            }),
          );
        },
        queue: () => {
          return _makeClient().fetchInfiniteQuery(
            makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
              memberId: "one",
              state: "open",
            }),
          );
        },
      };
      await expect(operations[operation]()).rejects.toMatchObject({
        name: "ZodError",
      });
    },
  );
  it("preserves structured field errors", async () => {
    stubFetch({
      "POST /api/removal-requests/id/decline": {
        status: 400,
        body: {
          error: "validation_error",
          message: "Invalid",
          details: { fieldErrors: { declineReason: ["Own words required"] } },
        },
      },
    });
    const request = declineRemovalRequest({
      requestId: "id",
      body: { declineReason: "Words" },
    });
    await expect(request).rejects.toBeInstanceOf(ApiRequestError);
    await expect(request).rejects.toMatchObject({
      status: 400,
      details: { fieldErrors: { declineReason: ["Own words required"] } },
    });
  });
});
