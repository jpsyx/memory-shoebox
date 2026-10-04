import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { deleteItem } from "@/api/items/items";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import {
  createRemovalRequest,
  declineRemovalRequest,
  withdrawRemovalRequest,
} from "./removals";
import {
  itemRemovalRequestsQueryOptions,
  removalRequestsInfiniteQueryOptions,
} from "./removalsQueryHelpers";

const REQUEST = makeRemovalRequestFromOverrides();
const ITEM = makeItemSummaryFromOverrides();
const QUEUE = {
  removalRequests: [REQUEST],
  nextCursor: null,
  openCount: 1,
  settledCount: 0,
};

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
  it("withdraws without a JSON body and preserves item deletion's 204", async () => {
    stubFetch({
      "POST /api/removal-requests/a%2Fb%20%3F/withdraw": {
        status: 200,
        body: REQUEST,
      },
      "DELETE /api/items/a%2Fb%20%3F": { status: 204, body: undefined },
    });
    await expect(withdrawRemovalRequest("a/b ?")).resolves.toEqual(REQUEST);
    await expect(deleteItem("a/b ?")).resolves.toBeUndefined();
    expect(getRecordedRequests()).toEqual([
      {
        method: "POST",
        url: "/api/removal-requests/a%2Fb%20%3F/withdraw",
        body: undefined,
      },
      { method: "DELETE", url: "/api/items/a%2Fb%20%3F", body: undefined },
    ]);
  });
  it("reads item requests without counting an item open", async () => {
    const response = {
      removalRequests: [REQUEST],
      nextCursor: null,
      item: ITEM,
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
        itemRemovalRequestsQueryOptions({
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
      removalRequestsInfiniteQueryOptions({
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
    const first = itemRemovalRequestsQueryOptions({
      memberId: "one",
      itemId: "item",
    }).queryKey;
    expect(first).not.toEqual(
      itemRemovalRequestsQueryOptions({ memberId: "two", itemId: "item" })
        .queryKey,
    );
    expect(first).not.toEqual(
      itemRemovalRequestsQueryOptions({ memberId: "one", itemId: "other" })
        .queryKey,
    );
    const open = removalRequestsInfiniteQueryOptions({
      memberId: "one",
      state: "open",
    }).queryKey;
    expect(open).not.toEqual(
      removalRequestsInfiniteQueryOptions({ memberId: "two", state: "open" })
        .queryKey,
    );
    expect(open).not.toEqual(
      removalRequestsInfiniteQueryOptions({ memberId: "one", state: "settled" })
        .queryKey,
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
    const options = removalRequestsInfiniteQueryOptions({
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
            itemRemovalRequestsQueryOptions({ memberId: "one", itemId: "id" }),
          );
        },
        queue: () => {
          return _makeClient().fetchInfiniteQuery(
            removalRequestsInfiniteQueryOptions({
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
