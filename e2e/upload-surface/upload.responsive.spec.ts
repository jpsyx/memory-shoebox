import {
  expectSurfaceControlsUnclipped,
  expectSurfaceContrast,
  expectMilestoneOptionContrast,
  expectContextControlContrast,
  scrollSurfaceStateForInspection,
  scrollSurfaceControlByWheel,
  expectSurfaceDraftReady,
  chooseSurfaceVisibilityException,
} from "./uploadSurfaceLayoutHelpers.ts";
import { type UploadSessionDetail } from "@memory-shoebox/shared";
import { expect, type Page } from "@playwright/test";
import { renameSync } from "node:fs";
import { join } from "node:path";
import {
  test,
  pickFilesInUploadSurface,
  readSurfaceSession,
  makeSurfaceMatrixDetailFromState,
} from "./uploadSurfaceTestHelpers.ts";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixtures/makeUploadSurfaceFixtures.ts";

test("surface 8 offers optional date correction for a real fallback capture day", async ({
  uploaderPage: page,
}, testInfo) => {
  const directory = testInfo.outputPath("undated");
  const paths = makeUploadSurfaceFixturePaths({ directory, count: 3 });
  const unknownPath = join(directory, "unknown-capture.jpg");
  renameSync(paths[2]!, unknownPath);
  await pickFilesInUploadSurface({ page, paths: [unknownPath] });
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  const detail = await readSurfaceSession({ request: page.request });
  expect(detail.undated?.fileCount).toBe(1);
  expect(detail.files[0]!.capturedOn).not.toBeNull();
  await expect(
    page.getByRole("textbox", { name: "Capture date", exact: true }),
  ).toBeVisible();
});

["light", "dark"].forEach((scheme) => {
  [1280, 768, 400, 640].forEach((width) => {
    test(`surface 8 ready images survive tick, scroll away and reentry at ${width}px in ${scheme}`, async ({
      uploaderPage: page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        reducedMotion: "reduce",
      });
      const paths = makeUploadSurfaceFixturePaths({
        directory: testInfo.outputPath("previews"),
        count: 20,
      });
      await pickFilesInUploadSurface({ page, paths });
      await expect(
        page.getByRole("button", { name: "Put 20 up", exact: true }),
      ).toBeEnabled();
      await _expectReadyPrintReentry(page);
      await expectSurfaceControlsUnclipped(page);
      await expectSurfaceContrast(page);
      await page.screenshot({
        path: `.playwright-mcp/upload-product-ready-${width}-${scheme}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `.playwright-mcp/upload-product-ready-${width}-${scheme}-${testInfo.project.name}-viewport.png`,
        fullPage: false,
      });
    });
  });
});

const STATES = [
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
type SurfaceState = (typeof STATES)[number];
const OCCASION = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

["light", "dark"].forEach((scheme) => {
  [1280, 768, 400].forEach((width) => {
    test(`surface 8 controlled API visual state matrix at ${width}px in ${scheme}`, async ({
      uploaderContext,
    }, testInfo) => {
      test.setTimeout(240_000);
      await STATES.reduce(async (previousState, state) => {
        await previousState;
        const page = await uploaderContext.newPage();
        page.setDefaultTimeout(15_000);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: scheme as "light" | "dark",
          reducedMotion: "reduce",
        });
        await _prepareMatrixState(
          page,
          state,
          testInfo.outputPath(`sending-${state}`),
        );
        await expectSurfaceControlsUnclipped(page);
        await expectSurfaceContrast(page);
        await expectContextControlContrast(page, state);
        await page.evaluate(() => {
          return window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `.playwright-mcp/upload-product-${state}-${width}-${scheme === "light" ? "day" : "night"}-${testInfo.project.name}.png`,
          fullPage: true,
        });
        await scrollSurfaceStateForInspection(page, state);
        await page.screenshot({
          path: `.playwright-mcp/upload-product-${state}-${width}-${scheme === "light" ? "day" : "night"}-${testInfo.project.name}-viewport.png`,
          fullPage: false,
        });
        await page.close();
      }, Promise.resolve());
    });
  });
});

async function _prepareMatrixState(
  page: Page,
  state: SurfaceState,
  directory: string,
): Promise<void> {
  if (state === "sending") {
    await _prepareSendingState({ page, directory });
    return;
  }
  const detail = makeSurfaceMatrixDetailFromState(state);
  await _installMatrixReads(page, state, detail);
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
    await expectSurfaceDraftReady(page, detail.sessionId);
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
    await _openMatrixAction(page, state);
  } else if (state === "visibility") {
    await scrollSurfaceControlByWheel(
      page,
      page.getByText("Except", { exact: true }),
      600,
    );
    await chooseSurfaceVisibilityException(page);
  }
}

async function _openMatrixAction(
  page: Page,
  state: SurfaceState,
): Promise<void> {
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

async function _installMatrixReads(
  page: Page,
  state: SurfaceState,
  detail: UploadSessionDetail,
): Promise<void> {
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

async function _expectReadyPrintReentry(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Put it all up.", exact: true }),
  ).toBeFocused();
  const image = page.getByRole("img", {
    name: /portrait-orientation-6-0.jpg/,
    exact: true,
  });
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: /portrait-orientation-6-0.jpg/ }),
    450,
  );
  await expect(image).toBeVisible({ timeout: 30_000 });
  const geometry = await image.evaluate((element) => {
    return {
      width: (element as HTMLImageElement).naturalWidth,
      height: (element as HTMLImageElement).naturalHeight,
    };
  });
  expect(geometry.height).toBeGreaterThan(geometry.width);
  await image.locator("..").click();
  await expect(image).toBeVisible();
  await expect(image.locator("..")).toHaveAttribute("aria-pressed", "true");
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: "Put 20 up", exact: true }),
    600,
  );
  await expect(image).not.toBeInViewport();
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: /portrait-orientation-6-0.jpg/ }),
    -450,
  );
  await expect(image).toBeVisible({ timeout: 30_000 });
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
