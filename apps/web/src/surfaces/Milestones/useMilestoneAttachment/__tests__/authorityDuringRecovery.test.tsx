import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { useMilestoneAttachment } from "../useMilestoneAttachment";
import type { MilestoneAttachmentOptions } from "../useMilestoneAttachment.types";
const detail = makeMilestoneDetailFromOverrides();
const item = makeItemSummaryFromOverrides();
const options: MilestoneAttachmentOptions = {
  detail,
  viewer: {
    memberId: "member-one",
    displayName: "Mamá",
    role: "uploader",
    isAdmin: false,
  },
  source: "span",
  hasUsableAuthority: true,
};
function _render() {
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
      (props: MilestoneAttachmentOptions) => {
        return useMilestoneAttachment(props);
      },
      { initialProps: options, wrapper },
    ),
    queryClient,
  };
}
describe("final attachment write authority", () => {
  it("blocks held uncertain recovery after a background detail failure, retains choices and recovers", async () => {
    let releaseRecovery: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      releaseRecovery = settle;
    });
    let isDetailUnavailable = false;
    let writes = 0;
    let recoveryReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        let body: unknown = detail;
        let status = 200;
        if (url.includes("/candidates")) {
          if (url.includes("scope=all")) {
            recoveryReads++;
            await held;
          }
          body = {
            candidates: [{ item, isAttached: false, isOutsideSpan: false }],
            nextCursor: null,
          };
        } else if (init?.method === "PATCH") {
          writes++;
          body =
            writes === 1
              ? {}
              : { ...detail, attachedCount: 1, detachedCount: 0 };
        } else if (isDetailUnavailable) {
          status = 404;
          body = { error: "not_found", message: "Occasion unavailable" };
        }
        return new Response(JSON.stringify(body), { status });
      }),
    );
    const { result, rerender, queryClient } = _render();
    const detailOptions = milestoneDetailQueryOptions({
      memberId: options.viewer.memberId,
      milestoneId: detail.milestone.milestoneId,
    });
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(item.itemId);
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
      expect(recoveryReads).toBe(1);
    });
    isDetailUnavailable = true;
    await act(async () => {
      await queryClient
        .fetchQuery({ ...detailOptions, staleTime: 0, retry: false })
        .catch(() => {});
    });
    expect(queryClient.getQueryState(detailOptions.queryKey)?.status).toBe(
      "error",
    );
    rerender({ ...options, hasUsableAuthority: false });
    releaseRecovery?.();
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(writes).toBe(1);
    expect(result.current.attachCount).toBe(1);
    expect(result.current.savedDetail).toBeUndefined();
    expect(result.current.error).toMatch(/Refresh the occasion/);
    isDetailUnavailable = false;
    await act(async () => {
      await queryClient.fetchQuery({
        ...detailOptions,
        staleTime: 0,
        retry: false,
      });
    });
    rerender(options);
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(result.current.savedDetail).toBeDefined();
    });
    expect(writes).toBe(2);
  });
  it("does not mistake the save's own detail preflight for failed authority", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      release = settle;
    });
    let hasStartedDetail = false;
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        let body: unknown = detail;
        if (url.includes("/candidates")) {
          body = {
            candidates: [{ item, isAttached: false, isOutsideSpan: false }],
            nextCursor: null,
          };
        } else if (init?.method === "PATCH") {
          writes++;
          body = { ...detail, attachedCount: 1, detachedCount: 0 };
        } else {
          hasStartedDetail = true;
          await held;
        }
        return new Response(JSON.stringify(body));
      }),
    );
    const { result, rerender } = _render();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(item.itemId);
    });
    act(() => {
      result.current.save();
    });
    await waitFor(() => {
      expect(hasStartedDetail).toBe(true);
    });
    rerender({ ...options, hasUsableAuthority: false });
    release?.();
    await waitFor(() => {
      expect(result.current.savedDetail).toBeDefined();
    });
    expect(writes).toBe(1);
  });
});
