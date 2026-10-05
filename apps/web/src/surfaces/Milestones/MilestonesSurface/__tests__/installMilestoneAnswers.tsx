import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { respondWith } from "@/testing/surfaceHarness";
import type { MilestoneDetail } from "@memory-shoebox/shared";
/** Shared authoritative fixture for the controller scenarios. */
export const detail = makeMilestoneDetailFromOverrides({
  itemCount: 0,
}) satisfies MilestoneDetail;

/** Shared authoritative fixture for the controller scenarios. */
export const milestoneId = detail.milestone.milestoneId satisfies string;

/** Installs or renders the shared controller test fixture. */
export function installMilestoneAnswers(
  overrides: Parameters<typeof respondWith>[0] = {},
): void {
  respondWith({
    "GET /api/milestones": {
      body: { milestones: [detail], nextCursor: null },
      status: 200,
    },
    [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
    ...overrides,
  });
}
