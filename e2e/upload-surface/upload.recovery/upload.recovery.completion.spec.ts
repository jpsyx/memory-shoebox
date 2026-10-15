import { expect } from "@playwright/test";

import { makeUploadSurfaceFixturePaths } from "../../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";

import {
  readUploadedFiles,
  readUploadSessionEmailAddresses,
} from "../../support/uploadCatalogHelpers.ts";

import {
  getSurfaceSessionFromRequest,
  pickFilesInUploadSurface,
  test,
} from "../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";

test("surface 8 completion network loss never claims an unconfirmed original is up", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("unconfirmed"),
    fileCount: 1,
  });
  await pickFilesInUploadSurface({ page, paths });
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  const detail = await getSurfaceSessionFromRequest({ request: page.request });
  let completionRequests = 0;
  await page.route(
    "**/api/upload-sessions/*/files/*/complete",
    async (route) => {
      completionRequests += 1;
      await route.abort("connectionfailed");
    },
  );
  await page.getByRole("button", { name: "Put 1 up", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "What did not arrive", exact: true })
      .getByText("Not confirmed up", { exact: true }),
  ).toBeVisible({ timeout: 100_000 });
  await expect(
    page.getByRole("heading", { name: "You were in the middle of this." }),
  ).toBeVisible();
  expect(completionRequests).toBeGreaterThan(1);
  expect((await readUploadedFiles(detail.sessionId))[0]!.state).toBe("sending");
  expect(await readUploadSessionEmailAddresses(detail.sessionId)).toEqual([]);
  await expect(
    page.getByRole("heading", { name: /1 up, across/ }),
  ).toBeHidden();
  await page.unroute("**/api/upload-sessions/*/files/*/complete");
  await page
    .getByRole("button", { name: "Resume upload", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /1 up, across/ })).toBeVisible(
    { timeout: 90_000 },
  );
  expect((await readUploadedFiles(detail.sessionId))[0]!.state).toBe("done");
});
