import { makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { recordedUrls, renderAt, respondWith } from "@/testing/surfaceHarness";
import type {
  ItemSummary,
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
function _makeDestinationAnswerFromRead({
  url,
  detail: currentDetail,
  mismatchCount,
}: Readonly<{ url: string; detail: MilestoneDetail; mismatchCount: number }>):
  | MilestoneDetail
  | ListMilestoneMismatchesResponse {
  return url.includes("/mismatches")
    ? {
        milestone: currentDetail.milestone,
        mismatches: mismatchCount
          ? [{ item, attachedAt: "2026-10-04T12:00:00.000Z" }]
          : [],
        wideningSpan: {
          startsOn: "2026-08-31",
          endsOn: currentDetail.milestone.endsOn,
        },
        nextCursor: null,
      }
    : { ...currentDetail, mismatchCount };
}
function _installDestinationReads(): {
  destinationReads: number;
} {
  const responseState: { destinationReads: number } = { destinationReads: 0 };
  const responses0 = _installDestinationDirectory();
  const original = fetch;
  let moved = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${responses0.firstPath}/reconcile`) {
        moved = true;
        return new Response(
          JSON.stringify({
            ...first,
            mismatchCount: 0,
            movedCount: 1,
            acknowledgedCount: 0,
            raisedElsewhere: [
              { milestone: second.milestone, mismatchCount: 1 },
            ],
          }),
        );
      }
      if (
        url.startsWith(responses0.firstPath) ||
        url.startsWith(responses0.secondPath)
      ) {
        const isDestination = url.startsWith(responses0.secondPath);
        const detail = isDestination ? second : first;
        const mismatchCount = isDestination ? Number(moved) : Number(!moved);
        if (isDestination) {
          responseState.destinationReads += 1;
        }
        return new Response(
          JSON.stringify(
            _makeDestinationAnswerFromRead({ url, detail, mismatchCount }),
          ),
        );
      }
      return original(url, init);
    }),
  );
  return responseState;
}
function _installDestinationDirectory(): {
  firstPath: string;
  secondPath: string;
} {
  const firstPath = `/api/milestones/${first.milestone.milestoneId}`;
  const secondPath = `/api/milestones/${second.milestone.milestoneId}`;
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [first, second], nextCursor: null },
    },
  });
  return { firstPath, secondPath };
}

const baseline = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
const first = {
  ...baseline,
  mismatchCount: 1,
  milestone: { ...baseline.milestone, endsOn: baseline.milestone.startsOn },
} satisfies MilestoneDetail;
const second = {
  ...baseline,
  milestone: {
    ...baseline.milestone,
    milestoneId: "018f0000-0000-7000-8000-000000008002",
    name: "Destination",
  },
} satisfies MilestoneDetail;
const item = makeItemSummaryFromOverrides({
  capturedOn: "2026-08-31",
}) satisfies ItemSummary;

function _seedAffectedOccasionCaches(client: QueryClient): {
  unrelated: QueryKey;
  otherMember: QueryKey;
  candidates: QueryKey;
} {
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const memberId = createMeResponse().me.member.memberId;
  const unrelated = makeMilestoneDetailQueryOptionsFromIdentity({
    memberId,
    milestoneId: "018f0000-0000-7000-8000-000000008003",
  }).queryKey;
  const otherMember = makeMilestoneDetailQueryOptionsFromIdentity({
    memberId: "other-member",
    milestoneId: second.milestone.milestoneId,
  }).queryKey;
  const candidates = makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity({
    memberId,
    milestoneId: second.milestone.milestoneId,
  }).queryKey;
  client.setQueryData(unrelated, first);
  client.setQueryData(otherMember, second);
  client.setQueryData(candidates, {
    pages: [{ candidates: [], nextCursor: null }],
    pageParams: [undefined],
  });
  return { unrelated, otherMember, candidates };
}
it("refreshes a recently cached raised-elsewhere destination immediately under production freshness without another item open", async () => {
  const responses0 = _installDestinationReads();
  const { router } = renderAt(
    `/milestones?milestone=${second.milestone.milestoneId}&mode=fix`,
  );
  const client = router.options.context!.queryClient;
  const { unrelated, otherMember, candidates } =
    _seedAffectedOccasionCaches(client);
  await screen.findByText(/No photographs need a date decision for/);
  const cachedReads = responses0.destinationReads;
  await act(async () => {
    await router.navigate({
      to: "/milestones",
      search: { milestone: first.milestone.milestoneId, mode: "fix" },
    });
  });
  const move = await screen.findByRole("button", { name: "Move the 1" });
  await waitFor(() => {
    expect(move).toBeEnabled();
  });
  await userEvent.click(move);
  const onward = await screen.findByRole("button", {
    name: "Fix dates for Destination",
  });
  await waitFor(() => {
    expect(onward).toBeEnabled();
  });
  expect(client.getQueryState(candidates)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  expect(client.getQueryState(otherMember)?.isInvalidated).toBe(false);
  await userEvent.click(onward);
  expect(
    await screen.findByRole("button", { name: "Leave these 1 as they are" }),
  ).toBeVisible();
  expect(responses0.destinationReads).toBeGreaterThan(cachedReads);
  expect(recordedUrls()).not.toContain(`/api/items/${item.itemId}`);
});
