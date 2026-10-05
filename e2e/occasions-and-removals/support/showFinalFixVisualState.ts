import type {
  ItemSummary,
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import type { Page } from "@playwright/test";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
  makeRemovalRequestFromOverrides,
} from "../../../apps/web/src/testing/askingAndOccasionsFixtureHelpers.ts";
const baseline = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
const detail = {
  ...baseline,
  milestone: { ...baseline.milestone, endsOn: baseline.milestone.startsOn },
  mismatchCount: 1,
} satisfies MilestoneDetail;
const destination = {
  ...detail.milestone,
  milestoneId: "018f0000-0000-7000-8000-000000008002",
  name: "The first week at the grandparents",
} satisfies MilestoneDetail["milestone"];
const item = makeItemSummaryFromOverrides() satisfies ItemSummary;

function _getMismatchPageFromState(
  state: string,
): ListMilestoneMismatchesResponse {
  return {
    milestone: detail.milestone,
    mismatches: [
      {
        item: {
          ...item,
          capturedOn: "2026-08-31",
          media: {
            ...item.media,
            thumb: {
              ...item.media.thumb,
              url: "http://localhost:5174/media/web/highChair-thumb.jpg",
            },
          },
        },
        attachedAt: "2026-10-04T12:00:00.000Z",
      },
    ],
    wideningSpan: { startsOn: "2026-08-31", endsOn: detail.milestone.endsOn },
    nextCursor: state === "fix-paging" ? "more" : null,
  };
}

async function _routeMilestoneState({
  page,
  state,
}: Readonly<{ page: Page; state: string }>): Promise<void> {
  await page.route("**/api/milestones**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const hasFailure =
      (state === "directory-error" && path === "/api/milestones") ||
      (state === "selection-error" &&
        path.endsWith(detail.milestone.milestoneId)) ||
      (state === "fix-error" && path.endsWith("/mismatches"));
    if (hasFailure) {
      await route.fulfill({
        status: 403,
        json: { error: "forbidden", message: "Unavailable" },
      });
      return;
    }
    const json = path.endsWith("/reconcile")
      ? {
          ...detail,
          movedCount: 0,
          acknowledgedCount: 1,
          raisedElsewhere: [{ milestone: destination, mismatchCount: 1 }],
        }
      : path.endsWith("/mismatches")
        ? _getMismatchPageFromState(state)
        : path === "/api/milestones"
          ? {
              milestones: [detail],
              nextCursor: state === "directory-paging" ? "more" : null,
            }
          : detail;
    await route.fulfill({ json });
  });
}

async function _routeQueueState({
  page,
  state,
}: Readonly<{ page: Page; state: string }>): Promise<void> {
  const request = makeRemovalRequestFromOverrides({
    media: null,
    createdAt: "2026-10-05T02:30:00.000Z",
  });
  await page.route("**/api/removal-requests?*", async (route) => {
    await route.fulfill(
      state === "queue-error"
        ? { status: 403, json: { error: "forbidden", message: "Unavailable" } }
        : {
            json: {
              removalRequests: [request],
              openCount: 2,
              settledCount: 0,
              nextCursor: "more",
            },
          },
    );
  });
}

function _controlLabel(state: string): string {
  return state === "queue-paging"
    ? "Load more requests"
    : state === "queue-error"
      ? "Try again"
      : state === "fix-paging"
        ? "Show more photographs (up to 500 per batch)"
        : state === "fix-error"
          ? "Refresh the occasion and photographs"
          : state === "raised"
            ? `Fix dates for ${destination.name}`
            : state === "directory-paging"
              ? "Load more milestones"
              : state === "directory-error"
                ? "Refresh the list"
                : "Refresh the occasion";
}

/** Controlled recovery branches, separate from live API verification. */
export async function showFinalFixVisualState({
  page,
  state,
  scheme,
}: Readonly<{
  page: Page;
  state: string;
  scheme: "light" | "dark";
}>): Promise<string> {
  await page.unrouteAll({ behavior: "wait" });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.addInitScript((rendition) => {
    localStorage.setItem("mantine-color-scheme-value", rendition);
  }, scheme);
  await _routeQueueState({ page, state });
  await _routeMilestoneState({ page, state });
  const address = state.startsWith("queue")
    ? "/removal-requests"
    : state.startsWith("directory")
      ? "/milestones"
      : `/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`;
  await page.goto(address);
  if (state === "raised") {
    await page
      .getByRole("button", { name: "Leave these 1 as they are" })
      .click();
  }
  return _controlLabel(state);
}
