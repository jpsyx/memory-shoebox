import { makeUploadSurfaceFixturePaths } from "../../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";

import type { CreateUploadEditRequest } from "@memory-shoebox/shared";

import { expect, type Route } from "@playwright/test";

import {
  getSurfaceSessionFromRequest,
  installSurfaceContractDetail,
  test,
} from "../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";
import {
  OCCASION,
  OCCASION_DETAIL,
  createOccasion,
  installOccasionContract,
  makePairDetail,
} from "./uploadinteractionsTestHelpers.ts";

test("surface 8 discarded draft cannot attach a late creation to a distinct batch after actual route reentry", async ({
  uploaderPage: page,
}, testInfo) => {
  await page.getByRole("link", { name: "Back to the timeline" }).click();
  await page.getByRole("link", { name: "Add", exact: true }).click();
  const initialPaths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("initial-draft"),
    fileCount: 2,
  });
  await page.locator("input[type=file]").setInputFiles(initialPaths);
  await expect(
    page.getByRole("button", { name: "Put 2 up", exact: true }),
  ).toBeEnabled();
  const detail = await getSurfaceSessionFromRequest({ request: page.request });
  const cancelled: string[] = [];
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() === "DELETE") {
      cancelled.push(new URL(route.request().url()).pathname);
    }
    await route.continue();
  });
  const writes: CreateUploadEditRequest[] = [];
  const held = Promise.withResolvers<Route>();
  const release = Promise.withResolvers<void>();
  await installOccasionContract({
    page,
    detail,
    writes,
    onCreate: async (route) => {
      held.resolve(route);
      await release.promise;
      await route.fulfill({ status: 201, json: OCCASION_DETAIL });
    },
  });
  await page
    .getByRole("button", { name: /portrait-orientation-6-0\.jpg/ })
    .and(page.locator("[aria-pressed]"))
    .click();
  await createOccasion(page);
  await held.promise;
  await expect(
    page.getByRole("button", { name: "Close milestone picker" }),
  ).toBeDisabled();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(() => {
      return cancelled;
    })
    .toEqual([`/api/upload-sessions/${detail.sessionId}`]);
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Put it all up." }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose photographs and videos")).toBeAttached();
  await expect(
    page.getByRole("button", { name: /portrait-orientation-6-0\.jpg/ }),
  ).toHaveCount(0);
  await page.unroute("**/api/upload-sessions/**");
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("replacement-draft"),
    fileCount: 2,
  });
  await page.locator("input[type=file]").setInputFiles(paths);
  await expect(
    page.getByRole("button", { name: "Put 2 up", exact: true }),
  ).toBeEnabled();
  const replacement = await getSurfaceSessionFromRequest({
    request: page.request,
  });
  expect(replacement.sessionId).not.toBe(detail.sessionId);
  expect(
    replacement.files.every((file) => {
      return !detail.files.some((original) => {
        return original.fileId === file.fileId;
      });
    }),
  ).toBe(true);
  const replacementChoice = page
    .getByRole("button", { name: /heic-rotated-1\.heic/ })
    .and(page.locator("[aria-pressed]"));
  await replacementChoice.click();
  const completed = page.waitForResponse((response) => {
    return (
      new URL(response.url()).pathname === "/api/milestones" &&
      response.request().method() === "POST"
    );
  });
  release.resolve();
  expect((await completed).status()).toBe(201);
  await expect(replacementChoice).toHaveAttribute("aria-pressed", "true");
  // Observe a bounded quiet interval after the delivered creation response.
  await page.waitForTimeout(300);
  expect(writes).toEqual([]);
  await expect(page.getByText(OCCASION.name, { exact: true })).toHaveCount(0);
});

test("surface 8 delayed creation locks its live picker and attaches its originally submitted targets", async ({
  uploaderPage: page,
}) => {
  const detail = makePairDetail();
  await installSurfaceContractDetail({ page, detail });
  const writes: CreateUploadEditRequest[] = [];
  const held = Promise.withResolvers<Route>();
  const release = Promise.withResolvers<void>();
  await installOccasionContract({
    page,
    detail,
    writes,
    onCreate: async (route) => {
      held.resolve(route);
      await release.promise;
      await route.fulfill({ status: 201, json: OCCASION_DETAIL });
    },
  });
  await page
    .getByRole("button", { name: /Family-1\.jpg/ })
    .and(page.locator("[aria-pressed]"))
    .click();
  await createOccasion(page);
  await held.promise;
  await expect(
    page.getByRole("button", { name: "Close milestone picker" }),
  ).toBeDisabled();
  expect(writes).toEqual([]);
  release.resolve();
  await expect
    .poll(() => {
      return writes.length;
    })
    .toBe(1);
  expect(writes[0]!.targetFileIds).toEqual([detail.files[0]!.fileId]);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("surface 8 closed failed attachment retains submitted targets on reopen", async ({
  uploaderPage: page,
}) => {
  const detail = makePairDetail();
  await installSurfaceContractDetail({ page, detail });
  const writes: CreateUploadEditRequest[] = [];
  await installOccasionContract({
    page,
    detail,
    writes,
    shouldRejectFirst: true,
  });
  await page
    .getByRole("button", { name: /Family-1\.jpg/ })
    .and(page.locator("[aria-pressed]"))
    .click();
  await createOccasion(page);
  await expect(
    page.getByRole("button", { name: "Retry attachment" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close milestone picker" }).click();
  await page.getByRole("button", { name: "Untick", exact: true }).click();
  await page
    .getByRole("button", { name: /Family-2\.jpg/ })
    .and(page.locator("[aria-pressed]"))
    .click();
  await page
    .getByRole("button", { name: "Put under a milestone", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry attachment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    writes.map((body) => {
      return body.targetFileIds;
    }),
  ).toEqual([[detail.files[0]!.fileId], [detail.files[0]!.fileId]]);
});
