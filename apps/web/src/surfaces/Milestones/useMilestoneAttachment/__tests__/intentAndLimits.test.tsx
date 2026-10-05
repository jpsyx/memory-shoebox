import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  detail,
  first,
  installCandidateAnswers,
  renderAttachmentController,
  second,
  VIEWER,
} from "./attachmentTestHelpers";
it("uses candidate isAttached and empty save does no PATCH", async () => {
  installCandidateAnswers();
  const { result } = renderAttachmentController();
  await waitFor(() => {
    return expect(result.current.entries).toHaveLength(2);
  });
  expect(result.current.chosenCount).toBe(1);
  act(() => {
    return result.current.save();
  });
  expect(
    getRecordedRequests().some((request) => {
      return request.method === "PATCH";
    }),
  ).toBe(false);
  expect(result.current.savedDetail).toEqual(detail);
});
it("sends observed deltas, blocks immediate repeats, and uses server counts", async () => {
  installCandidateAnswers();
  const { result } = renderAttachmentController();
  await waitFor(() => {
    return expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    result.current.toggle(first.itemId);
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
    result.current.save();
  });
  await waitFor(() => {
    return expect(result.current.savedDetail).toBeDefined();
  });
  const writes = getRecordedRequests().filter((request) => {
    return request.method === "PATCH";
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toEqual({
    attach: [second.itemId],
    detach: [first.itemId],
  });
  expect(result.current.savedCounts).toEqual({
    attachedCount: 1,
    detachedCount: 1,
  });
  expect(
    getRecordedRequests().some((request) => {
      return request.url.startsWith("/api/items");
    }),
  ).toBe(false);
});
it("two toggles cancel and background updates retain first baseline", async () => {
  installCandidateAnswers();
  const { result, queryClient } = renderAttachmentController();
  await waitFor(() => {
    return expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    result.current.toggle(second.itemId);
    result.current.toggle(second.itemId);
  });
  expect(result.current.attachCount).toBe(0);
  act(() => {
    return result.current.toggle(first.itemId);
  });
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return url.includes("/candidates")
        ? new Response(
            JSON.stringify({
              candidates: [
                { item: first, isAttached: false, isOutsideSpan: false },
                { item: second, isAttached: false, isOutsideSpan: false },
              ],
              nextCursor: null,
            }),
          )
        : original(url, init);
    }),
  );
  await act(async () => {
    await queryClient.invalidateQueries();
  });
  expect(result.current.detachCount).toBe(1);
});
it("retains choices while unusable authority blocks saving", async () => {
  installCandidateAnswers();
  const { result, rerender } = renderAttachmentController();
  await waitFor(() => {
    return expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    return result.current.toggle(second.itemId);
  });
  rerender({
    detail,
    viewer: VIEWER,
    source: "span",
    hasUsableAuthority: false,
  });
  act(() => {
    return result.current.save();
  });
  expect(
    getRecordedRequests().filter((request) => {
      return request.method === "PATCH";
    }),
  ).toHaveLength(0);
  expect(result.current.attachCount).toBe(1);
});

it("refuses 501 attachments before any request and keeps every choice", async () => {
  const items = Array.from({ length: 501 }, (_, index) => {
    return makeItemSummaryFromOverrides({
      itemId: `018f0000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
    });
  });
  stubFetch({
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      status: 200,
      body: {
        candidates: items.map((item) => {
          return { item, isAttached: false, isOutsideSpan: false };
        }),
        nextCursor: null,
      },
    },
  });
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(501);
  });
  act(() => {
    items.forEach((item) => {
      result.current.toggle(item.itemId);
    });
  });
  const requestCount = getRecordedRequests().length;
  act(() => {
    result.current.save();
  });
  expect(result.current.error).toMatch(/500/);
  expect(result.current.attachCount).toBe(501);
  expect(getRecordedRequests()).toHaveLength(requestCount);
});
it("an empty span page with a cursor advances to individual candidates", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          candidates: url.includes("cursor=")
            ? [{ item: second, isAttached: false, isOutsideSpan: false }]
            : [],
          nextCursor: url.includes("cursor=") ? null : "opaque+page",
        }),
      );
    }),
  );
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.hasMore).toBe(true);
  });
  expect(result.current.entries).toHaveLength(0);
  act(() => {
    result.current.loadMore();
  });
  await waitFor(() => {
    expect(result.current.entries[0]?.item.itemId).toBe(second.itemId);
  });
  expect(
    urls.some((url) => {
      return url.includes("cursor=opaque%2Bpage");
    }),
  ).toBe(true);
});
it("retries the current photographs without saving or losing a chosen ID", async () => {
  installCandidateAnswers();
  const { result, queryClient } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  const original = fetch;
  let hasFailure = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return url.includes("/candidates") && hasFailure
        ? new Response(
            JSON.stringify({ error: "forbidden", message: "No photographs" }),
            { status: 403 },
          )
        : original(url, init);
    }),
  );
  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["milestones", "candidates"],
    });
  });
  await waitFor(() => {
    expect(result.current.error).toMatch(/could not be read/);
  });
  hasFailure = false;
  act(() => {
    result.current.retryReads();
  });
  await waitFor(() => {
    expect(result.current.error).toBeUndefined();
  });
  expect(result.current.attachCount).toBe(1);
  expect(
    getRecordedRequests().some((request) => {
      return request.method === "PATCH";
    }),
  ).toBe(false);
});
