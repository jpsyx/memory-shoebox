import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { stubFetch } from "@/testing/fetchStubHelpers";
import type {
  ItemSummary,
  MilestoneDetail,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RenderHookResult } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useMilestoneAttachment } from ".././useMilestoneAttachment";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from ".././useMilestoneAttachment.types";
/** Shared authoritative fixture for the controller scenarios. */
export const detail =
  makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;

/** Shared authoritative fixture for the controller scenarios. */
export const VIEWER: Viewer = {
  memberId: "member-one",
  displayName: "Mamá",
  role: "uploader",
  isAdmin: false,
} as const;

/** Shared authoritative fixture for the controller scenarios. */
export const first = makeItemSummaryFromOverrides() satisfies ItemSummary;

/** Shared authoritative fixture for the controller scenarios. */
export const second = makeItemSummaryFromOverrides({
  itemId: "018f0000-0000-7000-8000-00000000f002",
}) satisfies ItemSummary;

/** Installs or renders the shared controller test fixture. */
export function renderAttachmentController(
  source: "span" | "archive" = "span",
): RenderHookResult<
  MilestoneAttachment,
  MilestoneAttachmentOptions & { hasUsableAuthority: boolean }
> & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
  const initialProps: MilestoneAttachmentOptions & {
    hasUsableAuthority: boolean;
  } = { detail, viewer: VIEWER, source, hasUsableAuthority: true };
  return {
    ...renderHook(
      (options) => {
        return useMilestoneAttachment(options);
      },
      {
        initialProps,
        wrapper,
      },
    ),
    queryClient,
  };
}

/** Installs or renders the shared controller test fixture. */
export function installCandidateAnswers(): void {
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

/** Installs or renders the shared controller test fixture. */
export function makeTimelinePageFromItems({
  items,
  cursor,
}: Readonly<{
  items: Array<typeof first>;
  cursor?: string;
}>): TimelineResponse {
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
    nextCursor: cursor ?? null,
    resultCount: null,
  };
}
