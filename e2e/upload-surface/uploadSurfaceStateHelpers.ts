import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { expect, type Page } from "@playwright/test";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import {
  chooseSurfaceVisibilityException,
  expectMilestoneOptionContrast,
  expectSurfaceDraftReady,
  scrollSurfaceControlByWheel,
} from "./uploadSurfaceLayoutHelpers.ts";
import {
  makeSurfaceMatrixDetailFromState,
  pickFilesInUploadSurface,
} from "./uploadSurfaceTestHelpers.ts";

/** Prototype states and explicit unavailable/denied/undated client coverage. */
export const SURFACE_STATES = [
  "select",
  "days",
  "selection",
  "tag",
  "tagged",
  "person",
  "people-tagged",
  "milestone",
  "milestone-new",
  "milestone-assigned",
  "milestone-fix",
  "visibility",
  "resume",
  "sending",
  "partial",
  "done",
  "denied",
  "unavailable",
  "undated",
] as const;
/** One state prepared by the real route's controlled client-contract driver. */
export type SurfaceState = (typeof SURFACE_STATES)[number];
const OCCASION = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

/**
 * Prepares controlled client states through the real Upload route and
 * actions.
 */
export async function prepareSurfaceState({
  page,
  state,
  directory,
}: Readonly<{
  page: Page;
  state: SurfaceState;
  directory: string;
}>): Promise<void> {
  if (state === "sending") {
    await _prepareSendingState({ page, directory });
    return;
  }
  const detail = makeSurfaceMatrixDetailFromState(state);
  await _installMatrixReads({ page: page, state: state, detail: detail });
  await page.goto("/upload");
  const heading =
    state === "denied"
      ? "Uploading is for posters."
      : state === "resume"
        ? "You were in the middle of this."
        : state === "partial"
          ? "262 up. Some did not."
          : state === "done"
            ? "264 up, across 3 days."
            : "Put it all up.";
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
  if (
    !["select", "denied", "unavailable", "resume", "partial", "done"].includes(
      state,
    )
  ) {
    await expectSurfaceDraftReady({ page: page, sessionId: detail.sessionId });
  }
  await _applyMatrixAction({ page, state });
}

async function _applyMatrixAction(
  options: Readonly<{ page: Page; state: SurfaceState }>,
): Promise<void> {
  const { page, state } = options;
  if (state === "unavailable") {
    await expect(
      page.getByRole("button", {
        name: "Retry this batch",
        exact: true,
      }),
    ).toBeVisible();
  } else if (
    ["selection", "tag", "person", "milestone", "milestone-new"].includes(state)
  ) {
    await page
      .getByRole("button", { name: "Tick all 12", exact: true })
      .click();
    await _openMatrixAction({ page: page, state: state });
  } else if (state === "visibility") {
    await scrollSurfaceControlByWheel({
      page: page,
      target: page.getByText("Except", { exact: true }),
      deltaY: 600,
    });
    await chooseSurfaceVisibilityException(page);
  }
}

async function _openMatrixAction({
  page,
  state,
}: Readonly<{ page: Page; state: SurfaceState }>): Promise<void> {
  if (state === "tag" || state === "person") {
    await page
      .getByRole("button", {
        name: state === "tag" ? "Add a tag" : "Tag somebody",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", {
        name: state === "tag" ? "Tags" : "Who is in them",
        exact: true,
      })
      .fill(state === "tag" ? "h" : "ab");
  } else if (state === "milestone" || state === "milestone-new") {
    await page
      .getByRole("button", { name: "Put under a milestone", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /Home from the hospital/ }),
    ).toBeVisible();
    await expectMilestoneOptionContrast(page);
    if (state === "milestone-new") {
      await page
        .getByRole("button", { name: /Create a new milestone/ })
        .click();
      await page
        .getByRole("textbox", { name: "What happened", exact: true })
        .fill("Home from the hospital");
    }
  }
}

async function _installMatrixReads({
  page,
  state,
  detail,
}: Readonly<{
  page: Page;
  state: SurfaceState;
  detail: UploadSessionDetail;
}>): Promise<void> {
  await page.route("**/api/upload-sessions/**", (route) => {
    return state === "select"
      ? route.fulfill({
          status: 204,
          body: "",
        })
      : state === "unavailable"
        ? route.fulfill({
            status: 503,
            json: {
              error: { code: "storage_unavailable", message: "Unavailable" },
            },
          })
        : route.fulfill({ json: detail });
  });
  await _installMatrixDirectories(page);
  if (state === "denied") {
    await page.route("**/api/me", async (route) => {
      const response = await route.fetch();
      const me = await response.json();
      me.me.role = "viewer";
      await route.fulfill({ json: me });
    });
  }
}

async function _prepareSendingState(
  options: Readonly<{ page: Page; directory: string }>,
): Promise<void> {
  const { page, directory } = options;
  await page.goto("/upload");
  await page.route("**/api/upload-sessions/*/files/*/complete", () => {});
  await pickFilesInUploadSurface({
    page,
    paths: makeUploadSurfaceFixturePaths({ directory, count: 1 }),
  });
  const completion = page.waitForRequest(
    (request) => {
      return new URL(request.url()).pathname.endsWith("/complete");
    },
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Put 1 up", exact: true }).click();
  await completion;
  await expect(
    page.getByRole("heading", { name: "Putting them up." }),
  ).toBeVisible();
}

async function _installMatrixDirectories(page: Page): Promise<void> {
  await _installMatrixMilestones(page);
  await page.route("**/api/members", (route) => {
    return route.fulfill({
      json: {
        shape: "directory",
        members: [
          {
            memberId: "018f0000-0000-7000-8000-000000008001",
            displayName: "Abuela Rosa",
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.route("**/api/groups", (route) => {
    return route.fulfill({
      json: {
        shape: "picker",
        groups: [
          {
            groupId: "018f0000-0000-7000-8000-000000008002",
            name: "The grandparents",
          },
        ],
        nextCursor: null,
      },
    });
  });
}

async function _installMatrixMilestones(page: Page): Promise<void> {
  await page.route("**/api/milestones**", (route) => {
    return route.fulfill({
      json: {
        milestones: [
          {
            milestone: OCCASION,
            itemCount: 12,
            dayCount: 1,
            canEdit: true,
            canDelete: true,
            mismatchCount: 0,
            createdBy: null,
            createdAt: "2026-10-03T00:00:00.000Z",
            updatedAt: "2026-10-03T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
    });
  });
}
