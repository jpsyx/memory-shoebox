import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import type { Answer, RecordedRequest } from "@/testing/fetchStubHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import type {
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
  ReconcileMilestoneResponse,
} from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  renderHook,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { useMilestoneReconcile } from "../useMilestoneReconcile";
import type {
  ReconcileController,
  ReconcileOptions,
} from "../useMilestoneReconcile.types";
const baselineDetail: MilestoneDetail = makeMilestoneDetailFromOverrides({
  mismatchCount: 650,
});
/** Occasion authority for paginated mismatch and widening scenarios. */
export const detail: MilestoneDetail = {
  ...baselineDetail,
  milestone: {
    ...baselineDetail.milestone,
    startsOn: "2026-09-18",
    endsOn: "2026-09-20",
  },
};
/** Editor whose member identity owns these isolated query reads. */
export const VIEWER: Viewer = {
  memberId: "member-one",
  displayName: "Mamá",
  role: "uploader",
  isAdmin: false,
};
/** First actual photograph identity in the visible mismatch batch. */
export const firstItemId = makeItemSummaryFromOverrides()
  .itemId satisfies string;
/** Second explicit photograph identity used for paging and target errors. */
export const SECOND_ITEM_ID =
  "018f0000-0000-7000-8000-00000000f002" satisfies string;
/** Two visible mismatch rows with their attachment timestamps. */
export const rows = [firstItemId, SECOND_ITEM_ID].map((itemId) => {
  return {
    item: makeItemSummaryFromOverrides({ itemId, capturedOn: "2026-08-31" }),
    attachedAt: "2026-10-04T12:00:00.000Z",
  };
}) satisfies ListMilestoneMismatchesResponse["mismatches"];
/** Whole-set extrema supplied by every mismatch page. */
export const WIDENING_SPAN = {
  startsOn: "2026-08-31",
  endsOn: "2026-10-02",
} satisfies ListMilestoneMismatchesResponse["wideningSpan"];
type Harness = RenderHookResult<ReconcileController, ReconcileOptions> & {
  client: QueryClient;
  answer: Answer;
  detailAnswer: { body: MilestoneDetail; status: number };
  page: { body: ListMilestoneMismatchesResponse; status: number };
};
function _installReconcileAnswers(
  response: unknown,
): Pick<Harness, "answer" | "detailAnswer" | "page"> {
  const answer = { body: response, status: 200 };
  const detailAnswer = { body: detail, status: 200 };
  const page = {
    body: {
      milestone: detail.milestone,
      mismatches: rows,
      wideningSpan: WIDENING_SPAN,
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
  return { answer, detailAnswer, page };
}
/** Mounts reconciliation with isolated queries and controllable API answers. */
export function renderReconcileController(
  response: unknown = {
    ...detail,
    movedCount: 2,
    acknowledgedCount: 0,
    raisedElsewhere: [],
  },
): Harness {
  const { answer, detailAnswer, page } = _installReconcileAnswers(response);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  const hook = renderHook(
    (props: Readonly<ReconcileOptions>) => {
      return useMilestoneReconcile(props);
    },
    { wrapper, initialProps: { detail, viewer: VIEWER } },
  );
  return { ...hook, client, answer, detailAnswer, page };
}
/** Waits until both visible identities are available for explicit actions. */
export async function waitForReconcileRows(
  result: Readonly<Harness["result"]>,
): Promise<void> {
  await waitFor(() => {
    return expect(result.current.strays).toHaveLength(2);
  });
}
/** Returns submitted reconciliation writes from the recorded requests. */
export function getReconcileWritesFromRequests(): RecordedRequest[] {
  return getRecordedRequests().filter((request) => {
    return request.method === "POST" || request.method === "PATCH";
  });
}

/** Chooses two explicit capture days in one React update boundary. */
export function chooseReconcileTargets(
  result: Readonly<{ current: ReconcileController }>,
): void {
  act(() => {
    result.current.changeTarget({
      itemId: firstItemId,
      targetOn: "2026-09-18",
    });
    result.current.changeTarget({
      itemId: SECOND_ITEM_ID,
      targetOn: "2026-09-20",
    });
  });
}
/** A confirmed two-item move for controllable reconciliation replies. */
export function makeMovedResponseFromDetail(
  currentDetail: Readonly<MilestoneDetail>,
): ReconcileMilestoneResponse {
  return {
    ...currentDetail,
    movedCount: 2,
    acknowledgedCount: 0,
    raisedElsewhere: [],
  };
}
