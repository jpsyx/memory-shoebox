import { expect } from "@playwright/test";

import { signInAs } from "../../../support/signInHelpers.ts";

import {
  readUploadedFiles,
  readUploadSessionEmailAddresses,
} from "../../../support/uploadCatalogHelpers.ts";

import { UPLOADER_EMAIL } from "../../../support/uploadHarnessHelpers.ts";

import { test } from "../../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";
import {
  expectFailedAndRefused,
  installWebKitSignInCookie,
  prepareFailedOriginal,
  prepareLabelledBatch,
} from "./uploadrecoveryTestHelpers.ts";

test("surface 8 failed and refused rows differ, and a settled retry leaves the notification outbox unchanged", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const detail = await prepareFailedOriginal({
    page,
    directory: testInfo.outputPath("failure"),
  });
  const failedId = detail.files[0]!.fileId;
  await page.getByRole("button", { name: "Put 3 up", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2 up. Some did not." }),
  ).toBeVisible({ timeout: 120_000 });
  await expectFailedAndRefused({ sessionId: detail.sessionId, failedId });
  const retry = page.getByRole("button", {
    name: "Retry portrait-orientation-6-0.jpg",
    exact: true,
  });
  await expect(retry).toHaveCount(1);
  const addresses = await readUploadSessionEmailAddresses(detail.sessionId);
  await page.unroute("**/uploads/**");
  await retry.click();
  await expect(
    page.getByRole("heading", { name: "3 up. Some did not." }),
  ).toBeVisible({ timeout: 90_000 });
  expect(
    (await readUploadedFiles(detail.sessionId)).filter((file) => {
      return file.state === "done";
    }),
  ).toHaveLength(3);
  expect(await readUploadSessionEmailAddresses(detail.sessionId)).toEqual(
    addresses,
  );
  await expect(
    page
      .getByText(
        "This photograph will appear on its day without another email.",
      )
      .first(),
  ).toBeVisible();
});

test("surface 8 an expired browser signs in again with its unstarted draft discarded", async ({
  uploaderPage: page,
  uploaderContext,
  browserName,
}, testInfo) => {
  test.setTimeout(90_000);
  const { detail } = await prepareLabelledBatch({
    page,
    directory: testInfo.outputPath("auth"),
    fileCount: 1,
    name: "addressed plan",
  });
  await uploaderContext.clearCookies();
  await page.goto(`/upload?session=${detail.sessionId}`);
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  if (browserName === "webkit") {
    await installWebKitSignInCookie(page);
  }
  await signInAs({ page, email: UPLOADER_EMAIL });
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByText("addressed plan", { exact: false })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByText("addressed plan", { exact: false })).toHaveCount(
    0,
  );
  const current = await page.request.get("/api/upload-sessions/current");
  expect(current.status()).toBe(204);
  const discarded = await page.request.get(
    `/api/upload-sessions/${detail.sessionId}`,
  );
  expect((await discarded.json()).state).toBe("cancelled");
});
