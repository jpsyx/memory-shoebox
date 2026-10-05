import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { renderHookWithQueryClient } from "@/testing/itemWriteTestHelpers";
import type { ItemSummary, MilestoneDetail } from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useMilestoneAttachment } from "../useMilestoneAttachment";
import type { MilestoneAttachment } from "../useMilestoneAttachment.types";
const detail: MilestoneDetail = makeMilestoneDetailFromOverrides();
const item: ItemSummary = makeItemSummaryFromOverrides();
const VIEWER: Viewer = {
  memberId: "member-one",
  displayName: "Mamá",
  role: "uploader",
  isAdmin: false,
};

function _renderAttachment(): ReturnType<
  typeof renderHookWithQueryClient<MilestoneAttachment>
> {
  stubFetch({
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
      status: 200,
      body: detail,
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      status: 200,
      body: {
        candidates: [{ item, isAttached: false, isOutsideSpan: false }],
        nextCursor: null,
      },
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useMilestoneAttachment({
        detail,
        viewer: VIEWER,
        source: "span",
        hasUsableAuthority: true,
      });
    },
  });
}

it.each(["transport", "json", "schema"] as const)(
  "keeps choices and hides %s diagnostics when preflight cannot read the occasion",
  async (failure) => {
    const { result } = _renderAttachment();
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      return result.current.toggle(item.itemId);
    });
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.endsWith(detail.milestone.milestoneId)) {
          return originalFetch(url, init);
        }
        if (failure === "transport") {
          throw new TypeError("Internal transport diagnostic");
        }
        return failure === "json"
          ? new Response("Internal JSON diagnostic", { status: 200 })
          : Response.json({ internal: "Schema diagnostic" });
      }),
    );
    act(() => {
      return result.current.save();
    });
    await waitFor(() => {
      return expect(result.current.error).toMatch(/choices are kept/i);
    });
    expect(result.current.error).not.toMatch(
      /diagnostic|invalid_type|unexpected|fetch/i,
    );
    expect(result.current.chosenCount).toBe(1);
    expect(result.current.isPending).toBe(false);
    expect(
      getRecordedRequests().filter((request) => {
        return request.method === "PATCH";
      }),
    ).toHaveLength(0);
  },
);
