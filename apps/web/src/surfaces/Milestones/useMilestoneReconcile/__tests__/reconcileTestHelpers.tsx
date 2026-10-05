import type { Answer, RecordedRequest } from "@/testing/fetchStubHelpers";
import type {
  MilestoneDetail,
  ListMilestoneMismatchesResponse,
} from "@memory-shoebox/shared";
import type {
  ReconcileController,
  ReconcileOptions,
} from "../useMilestoneReconcile.types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  renderHook,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { useMilestoneReconcile } from "../useMilestoneReconcile";
export const detail = makeMilestoneDetailFromOverrides({ mismatchCount: 650 });
detail.milestone = {
  ...detail.milestone,
  startsOn: "2026-09-18",
  endsOn: "2026-09-20",
};
export const viewer: Viewer = {
  memberId: "member-one",
  displayName: "Mamá",
  role: "uploader",
  isAdmin: false,
};
export const firstId = makeItemSummaryFromOverrides().itemId;
export const secondId = "018f0000-0000-7000-8000-00000000f002";
export const rows = [firstId, secondId].map((itemId) => {
  return {
    item: makeItemSummaryFromOverrides({ itemId, capturedOn: "2026-08-31" }),
    attachedAt: "2026-10-04T12:00:00.000Z",
  };
});
export const wideningSpan = { startsOn: "2026-08-31", endsOn: "2026-10-02" };
type Harness = RenderHookResult<ReconcileController, ReconcileOptions> & {
  client: QueryClient;
  answer: Answer;
  detailAnswer: { body: MilestoneDetail; status: number };
  page: { body: ListMilestoneMismatchesResponse; status: number };
};
export function renderReconcileController(
  response: unknown = {
    ...detail,
    movedCount: 2,
    acknowledgedCount: 0,
    raisedElsewhere: [],
  },
): Harness {
  const answer = { body: response, status: 200 };
  const detailAnswer = { body: detail, status: 200 };
  const page = {
    body: {
      milestone: detail.milestone,
      mismatches: rows,
      wideningSpan,
      nextCursor: null,
    },
    status: 200,
  };
  stubFetch({
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: detailAnswer,
    [`GET /api/milestones/${detail.milestone.milestoneId}/mismatches`]: page,
    [`POST /api/milestones/${detail.milestone.milestoneId}/reconcile`]: answer,
    [`PATCH /api/milestones/${detail.milestone.milestoneId}`]: {
      body: detail,
      status: 200,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  const hook = renderHook(
    (props: {
      detail: typeof detail;
      viewer: Viewer;
      hasUsableAuthority?: boolean;
    }) => {
      return useMilestoneReconcile(props);
    },
    { wrapper, initialProps: { detail, viewer } },
  );
  return { ...hook, client, answer, detailAnswer, page };
}
export async function waitForReconcileRows(
  result: ReturnType<typeof renderReconcileController>["result"],
): Promise<void> {
  await waitFor(() => {
    return expect(result.current.strays).toHaveLength(2);
  });
}
export function getReconcileWritesFromRequests(): RecordedRequest[] {
  return getRecordedRequests().filter((request) => {
    return request.method === "POST" || request.method === "PATCH";
  });
}
