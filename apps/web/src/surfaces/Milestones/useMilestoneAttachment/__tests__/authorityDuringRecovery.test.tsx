import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import type { ItemSummary, MilestoneDetail } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RenderHookResult } from "@testing-library/react";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useMilestoneAttachment } from "../useMilestoneAttachment";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from "../useMilestoneAttachment.types";
type AttachmentRecoveryState = {
  releaseRecovery: (() => void) | undefined;
  isDetailUnavailable: boolean;
  writes: number;
  recoveryReads: number;
};
function _installHeldAttachmentRecovery(): AttachmentRecoveryState {
  const responseState: AttachmentRecoveryState = {
    releaseRecovery: undefined,
    isDetailUnavailable: false,
    writes: 0,
    recoveryReads: 0,
  };

  const held = new Promise<void>((settle) => {
    responseState.releaseRecovery = settle;
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown = detail;
      let status = 200;
      if (url.includes("/candidates")) {
        if (url.includes("scope=all")) {
          responseState.recoveryReads++;
          await held;
        }
        body = {
          candidates: [{ item, isAttached: false, isOutsideSpan: false }],
          nextCursor: null,
        };
      } else if (init?.method === "PATCH") {
        responseState.writes++;
        body =
          responseState.writes === 1
            ? {}
            : { ...detail, attachedCount: 1, detachedCount: 0 };
      } else if (responseState.isDetailUnavailable) {
        status = 404;
        body = { error: "not_found", message: "Occasion unavailable" };
      }
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return responseState;
}

function _installDoesNotMistakeTheSavesOwnDetailFetch1(): {
  release: (() => void) | undefined;
  hasStartedDetail: boolean;
  writes: number;
} {
  const responseState: {
    release: (() => void) | undefined;
    hasStartedDetail: boolean;
    writes: number;
  } = { release: undefined, hasStartedDetail: false, writes: 0 };

  const held = new Promise<void>((settle) => {
    responseState.release = settle;
  });

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
        responseState.writes++;
        body = { ...detail, attachedCount: 1, detachedCount: 0 };
      } else {
        responseState.hasStartedDetail = true;
        await held;
      }
      return new Response(JSON.stringify(body));
    }),
  );
  return responseState;
}

const detail = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
const item = makeItemSummaryFromOverrides() satisfies ItemSummary;
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
const detailOptions = makeMilestoneDetailQueryOptionsFromIdentity({
  memberId: options.viewer.memberId,
  milestoneId: detail.milestone.milestoneId,
}) satisfies ReturnType<typeof makeMilestoneDetailQueryOptionsFromIdentity>;
function _saveAttachment(
  result: Readonly<
    RenderHookResult<MilestoneAttachment, MilestoneAttachmentOptions>["result"]
  >,
): void {
  act(() => {
    result.current.save();
  });
}
async function _refreshAttachmentAuthority({
  queryClient,
  allowFailure = false,
}: Readonly<{
  queryClient: QueryClient;
  allowFailure?: boolean;
}>): Promise<void> {
  await act(async () => {
    const read = queryClient.fetchQuery({
      ...detailOptions,
      staleTime: 0,
      retry: false,
    });
    await (allowFailure ? read.catch(() => {}) : read);
  });
}
function _renderAttachmentController(): RenderHookResult<
  MilestoneAttachment,
  MilestoneAttachmentOptions
> & { queryClient: QueryClient } {
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
    const responses0 = _installHeldAttachmentRecovery();
    const { result, rerender, queryClient } = _renderAttachmentController();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(item.itemId);
    });
    _saveAttachment(result);
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    _saveAttachment(result);
    await waitFor(() => {
      expect(responses0.recoveryReads).toBe(1);
    });
    responses0.isDetailUnavailable = true;
    await _refreshAttachmentAuthority({ queryClient, allowFailure: true });
    expect(queryClient.getQueryState(detailOptions.queryKey)?.status).toBe(
      "error",
    );
    rerender({ ...options, hasUsableAuthority: false });
    responses0.releaseRecovery?.();
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(responses0.writes).toBe(1);
    expect(result.current.attachCount).toBe(1);
    expect(result.current.savedDetail).toBeUndefined();
    expect(result.current.error).toMatch(/Refresh the occasion/);
    responses0.isDetailUnavailable = false;
    await _refreshAttachmentAuthority({ queryClient });
    rerender(options);
    _saveAttachment(result);
    await waitFor(() => {
      expect(result.current.savedDetail).toBeDefined();
    });
    expect(responses0.writes).toBe(2);
  });
  it("does not mistake the save's own detail preflight for failed authority", async () => {
    const responses1 = _installDoesNotMistakeTheSavesOwnDetailFetch1();
    const { result, rerender } = _renderAttachmentController();
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      result.current.toggle(item.itemId);
    });
    _saveAttachment(result);
    await waitFor(() => {
      expect(responses1.hasStartedDetail).toBe(true);
    });
    rerender({ ...options, hasUsableAuthority: false });
    responses1.release?.();
    await waitFor(() => {
      expect(result.current.savedDetail).toBeDefined();
    });
    expect(responses1.writes).toBe(1);
  });
});
