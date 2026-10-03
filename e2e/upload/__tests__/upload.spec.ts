import {
  RESUME_TAG,
  MEDIA_FIXTURE_PATHS,
  test,
  pickInTheHarness,
  expectTheBatchSurvived,
  expectOnlyTheMissingOnesSent,
  closeTheTabMidBatch,
} from "./uploadTestHelpers.ts";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";
import {
  uploadSessionDetailSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../app.config.ts";

import {
  readFakeS3Requests,
  readUploadedFiles,
} from "../../support/uploadCatalogHelpers.ts";
import {
  expectOneEmailPerRecipient,
  expectSettledOnce,
  expectTheTransferPaths,
} from "../../support/uploadExpectations/uploadTransferExpectationHelpers.ts";
import {
  expectTheDays,
  expectTheDerivatives,
  expectTheDuplicateSkipped,
  expectTheRefusal,
} from "../../support/uploadExpectations/uploadCatalogExpectationHelpers.ts";
import { expectThePostersShowTheClip } from "../../support/uploadExpectations/expectThePostersShowTheClip.ts";
import {
  DUPLICATE_FIXTURE_NAME,
  getSessionIdFromState,
  isGoogleChromeInstalled,
  MEDIA_FIXTURE_NAMES,
  MULTIPART_FIXTURE_NAME,
  REFUSED_FIXTURE_NAME,
  UPLOAD_FIXTURE_DIRECTORY,
  writeMultipartVideo,
} from "../../support/uploadHarnessHelpers.ts";

test.skip(({ channel }) => {
  return channel === "chrome" && !isGoogleChromeInstalled();
}, `Google Chrome is not installed. This project is the real browser on purpose: Playwright's bundled Chromium decodes no HEVC, which is what a phone records. Install Chrome, or run --project=upload-webkit.`);

test("a mixed batch goes up, lands on its days, and settles once", async ({
  uploaderContext,
}, testInfo) => {
  test.setTimeout(240_000);
  const multipartPath = testInfo.outputPath(MULTIPART_FIXTURE_NAME);
  const multipartBytes = writeMultipartVideo(multipartPath);
  try {
    const page = await uploaderContext.newPage();
    const proof = await pickInTheHarness({
      page,
      query: `concurrency=${appConfig.upload.maxParallelTransfers}`,
      paths: [
        ...MEDIA_FIXTURE_PATHS,
        multipartPath,
        join(UPLOAD_FIXTURE_DIRECTORY, REFUSED_FIXTURE_NAME),
      ],
      phase: "finished",
    });
    const sessionId = getSessionIdFromState(proof);
    const files = await readUploadedFiles(sessionId);
    const requests = await readFakeS3Requests();
    expectTheRefusal({ proof, files, requests });
    expectTheDays(files);
    expectTheDerivatives(files);
    await expectThePostersShowTheClip({ page, sessionId });
    expectTheTransferPaths({ sessionId, files, requests, multipartBytes });
    await expectSettledOnce({ sessionId, proof });
    await expectOneEmailPerRecipient(sessionId);
  } finally {
    rmSync(multipartPath, { force: true });
  }
});

test("a tab closed mid-transfer reopens to the same batch and sends only what is missing", async ({
  uploaderContext,
}) => {
  test.setTimeout(180_000);
  const { sessionId, landedFileIds } =
    await closeTheTabMidBatch(uploaderContext);

  const current = await (async (
    request: APIRequestContext,
  ): Promise<UploadSessionDetail> => {
    const response = await request.get("/api/upload-sessions/current");
    expect(response.status()).toBe(200);
    return uploadSessionDetailSchema.parse(await response.json());
  })(uploaderContext.request);
  expectTheBatchSurvived({ current, sessionId });

  const logLengthBeforeResume = (await readFakeS3Requests()).length;
  const resumed = await pickInTheHarness({
    page: await uploaderContext.newPage(),
    query: "concurrency=1",
    paths: MEDIA_FIXTURE_PATHS,
    phase: "finished",
  });
  await expectOnlyTheMissingOnesSent({
    resumed,
    sessionId,
    landedFileIds,
    logLengthBeforeResume,
  });
  await expectSettledOnce({ sessionId, proof: resumed });
  const files = await readUploadedFiles(sessionId);
  files.forEach((file) => {
    expect(file.state, file.originalFilename).toBe("done");
    expect(file.item?.tagNames, file.originalFilename).toContain(RESUME_TAG);
  });
  await expectOneEmailPerRecipient(sessionId);
});

test("the same photograph picked twice is sent once, and its copy settles the batch", async ({
  uploaderContext,
}, testInfo) => {
  const originalPath = join(UPLOAD_FIXTURE_DIRECTORY, MEDIA_FIXTURE_NAMES[0]);
  const copyPath = testInfo.outputPath(DUPLICATE_FIXTURE_NAME);
  copyFileSync(originalPath, copyPath);
  try {
    const proof = await pickInTheHarness({
      page: await uploaderContext.newPage(),
      query: "concurrency=1",
      paths: [originalPath, copyPath],
      phase: "finished",
    });
    const sessionId = getSessionIdFromState(proof);
    await expectTheDuplicateSkipped({
      sessionId,
      proof,
      files: await readUploadedFiles(sessionId),
      requests: await readFakeS3Requests(),
    });
    await expectOneEmailPerRecipient(sessionId);
  } finally {
    rmSync(copyPath, { force: true });
  }
});
