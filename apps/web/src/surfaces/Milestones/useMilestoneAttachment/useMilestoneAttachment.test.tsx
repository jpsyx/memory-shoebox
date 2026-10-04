import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { useMilestoneAttachment } from "./useMilestoneAttachment";
const detail = makeMilestoneDetailFromOverrides();
const viewer: Viewer = {
  memberId: "member-one",
  displayName: "Mamá",
  role: "uploader",
  isAdmin: false,
} as const;
const first = makeItemSummaryFromOverrides();
const second = makeItemSummaryFromOverrides({
  itemId: "018f0000-0000-7000-8000-00000000f002",
});
function _render(source: "span" | "archive" = "span") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
  return {
    ...renderHook(
      (options) => {
        return useMilestoneAttachment(options);
      },
      {
        initialProps: { detail, viewer, source, hasUsableAuthority: true },
        wrapper,
      },
    ),
    queryClient,
  };
}
function _candidates() {
  stubFetch({
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      status: 200,
      body: {
        candidates: [
          { item: first, isAttached: true, isOutsideSpan: false },
          { item: second, isAttached: false, isOutsideSpan: false },
        ],
        nextCursor: null,
      },
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
      status: 200,
      body: detail,
    },
    [`PATCH /api/milestones/${detail.milestone.milestoneId}/items`]: {
      status: 200,
      body: { ...detail, attachedCount: 1, detachedCount: 1 },
    },
  });
}
describe("occasion attachment intent", () => {
  it("uses candidate isAttached and empty save does no PATCH", async () => {
    _candidates();
    const { result } = _render();
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
    _candidates();
    const { result } = _render();
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
    _candidates();
    const { result, queryClient } = _render();
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
        if (url.includes("/candidates")) {
          return new Response(
            JSON.stringify({
              candidates: [
                { item: first, isAttached: false, isOutsideSpan: false },
                { item: second, isAttached: false, isOutsideSpan: false },
              ],
              nextCursor: null,
            }),
          );
        }
        return original(url, init);
      }),
    );
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    expect(result.current.detachCount).toBe(1);
  });
  it("retains choices while unusable authority blocks saving", async () => {
    _candidates();
    const { result, rerender } = _render();
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(2);
    });
    act(() => {
      return result.current.toggle(second.itemId);
    });
    rerender({ detail, viewer, source: "span", hasUsableAuthority: false });
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
});
function _page(items: Array<typeof first>, cursor: string | null = null) {
  return {
    days: [
      {
        capturedOn: "2026-09-14",
        itemCount: items.length,
        unseenCount: 0,
        milestoneBand: null,
        milestoneStrips: [],
        items,
      },
    ],
    nextCursor: cursor,
    resultCount: null,
  };
}
describe("paired archive streams", () => {
  it("keeps shared burst identities distinct, advances an empty page, and retains narrowed choices", async () => {
    const burst = {
      burstId: "018f0000-0000-7000-8000-00000000b001",
      coverItemId: "018f0000-0000-7000-8000-00000000f003",
      visibleFrameCount: 9,
      startsAt: first.capturedAt,
      endsAt: first.capturedAt,
      hasUnseenFrames: false,
    };
    const representative = { ...second, burst };
    const urls: string[] = [];
    let body: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        const query = new URL(url, "http://localhost").searchParams;
        let answer: unknown = detail;
        if (url.includes("/timeline")) {
          answer = query.has("tags")
            ? _page([])
            : query.get("excludeAttached") === "false"
              ? _page(
                  query.has("cursor")
                    ? [
                        { ...first, burst },
                        { ...first, burst },
                      ]
                    : [],
                  query.has("cursor") ? null : "attached-cursor",
                )
              : _page([representative], "available-cursor");
        }
        if (init?.method === "PATCH") {
          body = JSON.parse(String(init.body));
          answer = { ...detail, attachedCount: 1, detachedCount: 0 };
        }
        return new Response(JSON.stringify(answer), { status: 200 });
      }),
    );
    const { result } = _render("archive");
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      return result.current.loadMore();
    });
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(2);
    });
    act(() => {
      return result.current.toggle(representative.itemId);
    });
    act(() => {
      return result.current.onSelectionChange({
        tags: ["home"],
        people: ["person"],
        from: "2026-09-01",
        until: "2026-09-30",
      });
    });
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(0);
    });
    expect(result.current.attachCount).toBe(1);
    act(() => {
      return result.current.save();
    });
    await waitFor(() => {
      return expect(result.current.savedDetail).toBeDefined();
    });
    expect(body).toEqual({ attach: [representative.itemId], detach: [] });
    const filtered = urls.filter((url) => {
      return url.includes("/timeline") && url.includes("tags=");
    });
    expect(filtered.length).toBeGreaterThanOrEqual(2);
    const branchFilters = filtered.slice(0, 2).map((url) => {
      const query = new URL(url, "http://localhost").searchParams;
      query.delete("excludeAttached");
      return query.toString();
    });
    expect(branchFilters[0]).toBe(branchFilters[1]);
    expect(
      new URL(filtered[0]!, "http://localhost").searchParams.get("people"),
    ).toBe("person");
    expect(
      new URL(filtered[0]!, "http://localhost").searchParams.get("until"),
    ).toBe("2026-09-30");
    expect(
      urls.some((url) => {
        return (
          url.includes("cursor=attached-cursor") &&
          url.includes("excludeAttached=false")
        );
      }),
    ).toBe(true);
    expect(
      urls.some((url) => {
        return (
          url.includes("cursor=available-cursor") &&
          url.includes("excludeAttached=true")
        );
      }),
    ).toBe(true);
    expect(
      new URL(filtered[0]!, "http://localhost").searchParams.get("from"),
    ).toBe("2026-09-01");
    expect(
      urls
        .filter((url) => {
          return url.includes("/timeline");
        })
        .every((url) => {
          return !new URL(url, "http://localhost").searchParams.has("q");
        }),
    ).toBe(true);
  });
  it.each(["schema", "transport"])(
    "uncertain %s save refreshes scope=all with empty advancing pages before a deliberate retry",
    async (failure) => {
      let attempts = 0;
      const urls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          urls.push(url);
          const query = new URL(url, "http://localhost").searchParams;
          let answer: unknown = detail;
          if (url.includes("candidates")) {
            answer = {
              candidates:
                query.get("scope") === "all" && !query.has("cursor")
                  ? []
                  : [
                      {
                        item: second,
                        isAttached: query.get("scope") === "all",
                        isOutsideSpan: false,
                      },
                    ],
              nextCursor:
                query.get("scope") === "all" && !query.has("cursor")
                  ? "recovery"
                  : null,
            };
          }
          if (init?.method === "PATCH") {
            attempts++;
            if (failure === "transport") {
              throw new TypeError("Fixture connection lost");
            }
            answer = { invalid: true };
          }
          return new Response(JSON.stringify(answer), { status: 200 });
        }),
      );
      const { result } = _render();
      await waitFor(() => {
        return expect(result.current.entries).toHaveLength(1);
      });
      act(() => {
        return result.current.toggle(second.itemId);
      });
      act(() => {
        return result.current.save();
      });
      await waitFor(() => {
        return expect(result.current.error).toBeDefined();
      });
      expect(result.current.attachCount).toBe(1);
      act(() => {
        return result.current.save();
      });
      await waitFor(() => {
        return expect(result.current.savedDetail).toBeDefined();
      });
      expect(attempts).toBe(1);
      expect(
        urls.some((url) => {
          return url.includes("scope=all") && url.includes("cursor=recovery");
        }),
      ).toBe(true);
      expect(result.current.savedCounts).toBeUndefined();
    },
  );
});
describe("late read ownership and recovery failures", () => {
  it("late old filter answers cannot replace the current results or choices", async () => {
    let releaseOld: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      releaseOld = settle;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const query = new URL(url, "http://localhost").searchParams;
        if (query.get("tags") === "old") {
          await held;
        }
        return new Response(
          JSON.stringify(
            _page(query.get("tags") === "old" ? [first] : [second]),
          ),
        );
      }),
    );
    const { result } = _render("archive");
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(second.itemId);
      result.current.onSelectionChange({
        tags: ["old"],
        people: [],
        from: undefined,
        until: undefined,
      });
    });
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => {
          return String(url).includes("tags=old");
        }),
      ).toBe(true);
    });
    act(() => {
      result.current.onSelectionChange({
        tags: ["new"],
        people: [],
        from: undefined,
        until: undefined,
      });
    });
    await waitFor(() => {
      expect(result.current.entries[0]?.item.itemId).toBe(second.itemId);
    });
    releaseOld?.();
    await act(async () => {
      await held;
    });
    expect(
      result.current.entries.map((entry) => {
        return entry.item.itemId;
      }),
    ).toEqual([second.itemId]);
  });
  it("requires all uncertain IDs, never treating a missing identity as detached", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        let body: unknown = detail;
        if (url.includes("candidates")) {
          body = {
            candidates: url.includes("scope=all")
              ? []
              : [{ item: second, isAttached: false, isOutsideSpan: false }],
            nextCursor: null,
          };
        }
        if (init?.method === "PATCH") {
          attempts++;
          body = {};
        }
        return new Response(JSON.stringify(body));
      }),
    );
    const { result } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(second.itemId);
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.error).toMatch(/unavailable/);
    expect(attempts).toBe(1);
    expect(result.current.savedDetail).toBeUndefined();
    expect(result.current.attachCount).toBe(1);
  });
});
describe("uncertain intent changes", () => {
  it("verifies the original pending identity when a later toggle cancels the old delta", async () => {
    const patches: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        let body: unknown = detail;
        if (url.includes("candidates")) {
          body = {
            candidates: [
              {
                item: second,
                isAttached: url.includes("scope=all"),
                isOutsideSpan: false,
              },
            ],
            nextCursor: null,
          };
        }
        if (init?.method === "PATCH") {
          patches.push(JSON.parse(String(init.body)));
          body =
            patches.length === 1
              ? {}
              : { ...detail, attachedCount: 0, detachedCount: 1 };
        }
        return new Response(JSON.stringify(body));
      }),
    );
    const { result } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(second.itemId);
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    act(() => {
      result.current.toggle(second.itemId);
    });
    expect(result.current.attachCount).toBe(0);
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.savedDetail).toBeDefined();
    });
    expect(patches).toEqual([
      { attach: [second.itemId], detach: [] },
      { attach: [], detach: [second.itemId] },
    ]);
  });
});
describe("submission limits and ownership", () => {
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
    const { result } = _render();
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
  it("permission refusal keeps choices; refreshed canEdit blocks retry", async () => {
    _candidates();
    let canEdit = true;
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({ error: "forbidden", message: "No permission" }),
            { status: 403 },
          );
        }
        if (url === `/api/milestones/${detail.milestone.milestoneId}`) {
          return new Response(JSON.stringify({ ...detail, canEdit }));
        }
        return original(url, init);
      }),
    );
    const { result } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });
    act(() => {
      result.current.toggle(second.itemId);
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    expect(result.current.attachCount).toBe(1);
    canEdit = false;
    const attempts = vi.mocked(fetch).mock.calls.filter(([, init]) => {
      return init?.method === "PATCH";
    }).length;
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => {
        return init?.method === "PATCH";
      }),
    ).toHaveLength(attempts);
  });
  it("a pending old member operation cannot write after authority responds", async () => {
    _candidates();
    const { result, rerender } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });
    let release: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      release = settle;
    });
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `/api/milestones/${detail.milestone.milestoneId}`) {
          await held;
        }
        return original(url, init);
      }),
    );
    act(() => {
      result.current.toggle(second.itemId);
    });
    act(() => {
      result.current.save();
    });
    rerender({
      detail,
      viewer: { ...viewer, memberId: "member-two" },
      source: "span",
      hasUsableAuthority: true,
    });
    release?.();
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(
      getRecordedRequests().some((request) => {
        return request.method === "PATCH";
      }),
    ).toBe(false);
    expect(result.current.savedDetail).toBeUndefined();
  });
});
describe("candidate continuations and recovery cursor safety", () => {
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
    const { result } = _render();
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
  it("blocks an uncertain retry when the recovery cursor cycles", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        let body: unknown = detail;
        if (url.includes("candidates")) {
          body = url.includes("scope=all")
            ? { candidates: [], nextCursor: "repeated" }
            : {
                candidates: [
                  { item: second, isAttached: false, isOutsideSpan: false },
                ],
                nextCursor: null,
              };
        }
        if (init?.method === "PATCH") {
          attempts++;
          body = {};
        }
        return new Response(JSON.stringify(body));
      }),
    );
    const { result } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(second.itemId);
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.error).toMatch(/repeated a page/);
    });
    expect(attempts).toBe(1);
    expect(result.current.attachCount).toBe(1);
    expect(result.current.savedDetail).toBeUndefined();
  });
});
describe("explicit read recovery", () => {
  it("retries the current photographs without saving or losing a chosen ID", async () => {
    _candidates();
    const { result, queryClient } = _render();
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
        if (url.includes("/candidates") && hasFailure) {
          return new Response(
            JSON.stringify({ error: "forbidden", message: "No photographs" }),
            { status: 403 },
          );
        }
        return original(url, init);
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
});
