import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  recordedRequests,
  renderAt,
  respondWith,
} from "@/testing/surfaceHarness";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
function _installUsesVocabularyQAndNeverTimelineQAnswers0(): void {
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
}

const detail = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
describe("filtered attachment sheet", () => {
  it("uses vocabulary q and never timeline q", async () => {
    _installUsesVocabularyQAndNeverTimelineQAnswers0();
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
