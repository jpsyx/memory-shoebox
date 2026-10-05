import type {
  BurstSummary,
  ItemSummary,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  detail,
  first,
  makeTimelinePageFromItems,
  renderAttachmentController,
  second,
} from "./attachmentTestHelpers";
type ArchiveResponses = {
  representative: ItemSummary;
  urls: string[];
  body: unknown;
};
function _getArchivePageFromQuery({
  query,
  burst,
  representative,
}: Readonly<{
  query: URLSearchParams;
  burst: BurstSummary;
  representative: ItemSummary;
}>): TimelineResponse {
  return query.has("tags")
    ? makeTimelinePageFromItems({ items: [] })
    : query.get("excludeAttached") === "false"
      ? makeTimelinePageFromItems({
          items: query.has("cursor")
            ? [
                { ...first, burst },
                { ...first, burst },
              ]
            : [],
          cursor: query.has("cursor") ? undefined : "attached-cursor",
        })
      : makeTimelinePageFromItems({
          items: [representative],
          cursor: "available-cursor",
        });
}
function _installArchiveAnswers(): ArchiveResponses {
  const responseState: ArchiveResponses = {
    representative: {
      ...second,
      burst: {
        burstId: "018f0000-0000-7000-8000-00000000b001",
        coverItemId: "018f0000-0000-7000-8000-00000000f003",
        visibleFrameCount: 9,
        startsAt: first.capturedAt,
        endsAt: first.capturedAt,
        hasUnseenFrames: false,
      },
    },
    urls: [],
    body: undefined,
  };
  const burst = responseState.representative.burst!;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      responseState.urls.push(url);
      const query = new URL(url, "http://localhost").searchParams;
      const answer =
        init?.method === "PATCH"
          ? (() => {
              responseState.body = JSON.parse(String(init.body));
              return { ...detail, attachedCount: 1, detachedCount: 0 };
            })()
          : url.includes("/timeline")
            ? _getArchivePageFromQuery({
                query,
                burst,
                representative: responseState.representative,
              })
            : detail;
      return new Response(JSON.stringify(answer), { status: 200 });
    }),
  );
  return responseState;
}
function _narrowArchiveSelection(
  result: Readonly<ReturnType<typeof renderAttachmentController>["result"]>,
): void {
  act(() => {
    result.current.onSelectionChange({
      tags: ["home"],
      people: ["person"],
      from: "2026-09-01",
      until: "2026-09-30",
    });
  });
}
it("keeps shared burst identities distinct and advances both archive streams through an empty page", async () => {
  const responses = _installArchiveAnswers();
  const { result } = renderAttachmentController("archive");
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.loadMore();
  });
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(2);
  });
  expect(
    responses.urls.some((url) => {
      return (
        url.includes("cursor=attached-cursor") &&
        url.includes("excludeAttached=false")
      );
    }),
  ).toBe(true);
  expect(
    responses.urls.some((url) => {
      return (
        url.includes("cursor=available-cursor") &&
        url.includes("excludeAttached=true")
      );
    }),
  ).toBe(true);
});
it("retains an explicit attachment when narrowing hides every archive print", async () => {
  const responses = _installArchiveAnswers();
  const { result } = renderAttachmentController("archive");
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.loadMore();
  });
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    result.current.toggle(responses.representative.itemId);
  });
  _narrowArchiveSelection(result);
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(0);
  });
  expect(result.current.attachCount).toBe(1);
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.savedDetail).toBeDefined();
  });
  expect(responses.body).toEqual({
    attach: [responses.representative.itemId],
    detach: [],
  });
});
it("passes identical tag, person and date filters to both archive streams without text search", async () => {
  const responses = _installArchiveAnswers();
  const { result } = renderAttachmentController("archive");
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  _narrowArchiveSelection(result);
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(0);
  });
  const filtered = responses.urls.filter((url) => {
    return url.includes("/timeline") && url.includes("tags=");
  });
  expect(filtered.length).toBeGreaterThanOrEqual(2);
  const branchFilters = filtered.slice(0, 2).map((url) => {
    const query = new URL(url, "http://localhost").searchParams;
    query.delete("excludeAttached");
    return query.toString();
  });
  expect(branchFilters[0]).toBe(branchFilters[1]);
  const query = new URL(filtered[0]!, "http://localhost").searchParams;
  expect(query.get("people")).toBe("person");
  expect(query.get("until")).toBe("2026-09-30");
  expect(query.get("from")).toBe("2026-09-01");
  expect(
    responses.urls
      .filter((url) => {
        return url.includes("/timeline");
      })
      .every((url) => {
        return !new URL(url, "http://localhost").searchParams.has("q");
      }),
  ).toBe(true);
});
