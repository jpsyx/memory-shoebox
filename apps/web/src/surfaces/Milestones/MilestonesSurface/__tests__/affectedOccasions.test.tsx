import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  makeMilestoneDetailFromOverrides,
  makeItemSummaryFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { milestoneCandidatesInfiniteQueryOptions } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";
const baseline = makeMilestoneDetailFromOverrides();
const first = {
  ...baseline,
  mismatchCount: 1,
  milestone: { ...baseline.milestone, endsOn: baseline.milestone.startsOn },
};
const second = {
  ...baseline,
  milestone: {
    ...baseline.milestone,
    milestoneId: "018f0000-0000-7000-8000-000000008002",
    name: "Destination",
  },
};
const item = makeItemSummaryFromOverrides({ capturedOn: "2026-08-31" });

it("refreshes a recently cached raised-elsewhere destination immediately under production freshness without another item open", async () => {
  const firstPath = `/api/milestones/${first.milestone.milestoneId}`;
  const secondPath = `/api/milestones/${second.milestone.milestoneId}`;
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [first, second], nextCursor: null },
    },
  });
  const original = fetch;
  let moved = false;
  let destinationReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${firstPath}/reconcile`) {
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
      if (url.startsWith(firstPath) || url.startsWith(secondPath)) {
        const isDestination = url.startsWith(secondPath);
        const detail = isDestination ? second : first;
        const mismatchCount = isDestination ? Number(moved) : Number(!moved);
        if (isDestination) {
          destinationReads += 1;
        }
        return new Response(
          JSON.stringify(
            url.includes("/mismatches")
              ? {
                  milestone: detail.milestone,
                  mismatches: mismatchCount
                    ? [{ item, attachedAt: "2026-10-04T12:00:00.000Z" }]
                    : [],
                  wideningSpan: {
                    startsOn: "2026-08-31",
                    endsOn: detail.milestone.endsOn,
                  },
                  nextCursor: null,
                }
              : { ...detail, mismatchCount },
          ),
        );
      }
      return original(url, init);
    }),
  );
  const { router } = renderAt(
    `/milestones?milestone=${second.milestone.milestoneId}&mode=fix`,
  );
  router.options.context!.queryClient.setDefaultOptions({
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const client = router.options.context!.queryClient;
  const memberId = createMeResponse().me.member.memberId;
  const unrelated = milestoneDetailQueryOptions({
    memberId,
    milestoneId: "018f0000-0000-7000-8000-000000008003",
  }).queryKey;
  const otherMember = milestoneDetailQueryOptions({
    memberId: "other-member",
    milestoneId: second.milestone.milestoneId,
  }).queryKey;
  const candidates = milestoneCandidatesInfiniteQueryOptions({
    memberId,
    milestoneId: second.milestone.milestoneId,
  }).queryKey;
  client.setQueryData(unrelated, first);
  client.setQueryData(otherMember, second);
  client.setQueryData(candidates, {
    pages: [{ candidates: [], nextCursor: null }],
    pageParams: [null],
  });
  await screen.findByText(/No photographs need a date decision for/);
  const cachedReads = destinationReads;
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
  expect(destinationReads).toBeGreaterThan(cachedReads);
  expect(recordedUrls()).not.toContain(`/api/items/${item.itemId}`);
});
