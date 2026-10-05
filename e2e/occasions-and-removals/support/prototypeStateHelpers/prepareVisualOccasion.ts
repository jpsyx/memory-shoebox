import type { Page } from "@playwright/test";
import type { ItemSummary } from "@memory-shoebox/shared";
import { makeVisualOccasions } from "./makeVisualOccasions.ts";
import { VISUAL_MILESTONE_ID } from "./prototypeStateHelpers.constants.ts";

/** Controlled occasion state responses, distinct from real API verification. */
export async function prepareVisualOccasion(options: {
  page: Page;
  state: string;
  item: ItemSummary;
}): Promise<string> {
  const { page, state, item } = options;
  const rows = makeVisualOccasions();
  const selected =
    rows[
      state === "empty"
        ? 4
        : state === "fix"
          ? 3
          : state === "delete" || state === "edit"
            ? 1
            : 0
    ]!;
  const detail = {
    ...selected,
    milestone: { ...selected.milestone, milestoneId: VISUAL_MILESTONE_ID },
    mismatchCount: state === "fix" ? 4 : 0,
  };
  await _routeMilestones(page, item, detail, rows);
  await _routeTimeline(page, item);
  return state === "list"
    ? "/milestones"
    : state.startsWith("create") && state !== "created"
      ? "/milestones?mode=create"
      : `/milestones?milestone=${VISUAL_MILESTONE_ID}&mode=${state}`;
}

async function _routeMilestones(
  page: Page,
  item: ItemSummary,
  detail: ReturnType<typeof makeVisualOccasions>[number],
  rows: ReturnType<typeof makeVisualOccasions>,
): Promise<void> {
  await page.route("**/api/milestones**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/candidates")) {
      await route.fulfill({
        json: {
          candidates: [
            item,
            { ...item, itemId: "018f0000-0000-7000-8000-00000000f002" },
          ].map((candidate) => {
            return { item: candidate, isAttached: false, isOutsideSpan: false };
          }),
          nextCursor: null,
        },
      });
    } else if (path.endsWith("/mismatches")) {
      await route.fulfill({
        json: {
          milestone: detail.milestone,
          mismatches: [0, 1, 2, 3].map((index) => {
            return {
              item: {
                ...item,
                itemId: `018f0000-0000-7000-8000-00000000f00${index + 1}`,
                capturedOn: "2026-09-07",
              },
              attachedAt: "2026-09-27T12:00:00.000Z",
            };
          }),
          wideningSpan: { startsOn: "2026-09-07", endsOn: "2026-09-13" },
          nextCursor: null,
        },
      });
    } else if (path === "/api/milestones") {
      await route.fulfill({ json: { milestones: rows, nextCursor: null } });
    } else {
      await route.fulfill({ json: detail });
    }
  });
}

async function _routeTimeline(page: Page, item: ItemSummary): Promise<void> {
  await page.route("**/api/timeline?*", async (route) => {
    const excluded =
      new URL(route.request().url()).searchParams.get("excludeAttached") ===
      "true";
    await route.fulfill({
      json: {
        days: excluded
          ? [
              {
                capturedOn: item.capturedOn,
                itemCount: 1,
                unseenCount: 0,
                milestoneBand: null,
                milestoneStrips: [],
                items: [item],
              },
            ]
          : [],
        nextCursor: null,
        resultCount: null,
      },
    });
  });
  await page.route("**/api/filters/facets*", async (route) => {
    await route.fulfill({ json: { tags: [], people: [] } });
  });
}
