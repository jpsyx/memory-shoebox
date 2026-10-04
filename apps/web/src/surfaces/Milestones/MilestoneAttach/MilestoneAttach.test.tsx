import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  renderAt,
  respondWith,
  recordedRequests,
} from "@/testing/surfaceHarness";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
const detail = makeMilestoneDetailFromOverrides();
describe("filtered attachment sheet", () => {
  it("uses vocabulary q and never timeline q", async () => {
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
        status: 200,
        body: detail,
      },
      "GET /api/timeline": {
        status: 200,
        body: { days: [], nextCursor: null, resultCount: null },
      },
      "GET /api/filters/facets": {
        status: 200,
        body: { tags: [], people: [] },
      },
      "GET /api/tags": { status: 200, body: { tags: [] } },
      "GET /api/people": { status: 200, body: { people: [] } },
    });
    renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=attach`,
    );
    const input = await screen.findByRole("textbox");
    await userEvent.type(input, "Home");
    await waitFor(() => {
      expect(
        recordedRequests().some((line) => {
          return line.includes("/tags?q=Home");
        }),
      ).toBe(true);
    });
    expect(
      recordedRequests().some((line) => {
        return line.includes("/tags?q=Home");
      }),
    ).toBe(true);
    expect(
      recordedRequests()
        .filter((line) => {
          return line.includes("/timeline");
        })
        .every((line) => {
          return !line.includes("q=");
        }),
    ).toBe(true);
  });
});
