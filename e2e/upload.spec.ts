import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import {
  uploadSessionDetailSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { appConfig } from "../app.config.ts";
import type { FakeS3Request } from "./support/fakeS3Server/fakeS3Server.ts";
import {
  getOriginalRequestsFromLog,
  readFakeS3Requests,
  readUploadedFiles,
} from "./support/uploadCatalog.ts";
import {
  expectOneEmailPerRecipient,
  expectSettledOnce,
  expectTheDays,
  expectTheDerivatives,
  expectTheDuplicateSkipped,
  expectThePostersShowTheClip,
  expectTheRefusal,
  expectTheTransferPaths,
} from "./support/uploadExpectations.ts";
import {
  closeOpenUploadSession,
  DUPLICATE_FIXTURE_NAME,
  getEventsFromState,
  getSessionIdFromState,
  getUploaderStorageState,
  isGoogleChromeInstalled,
  MEDIA_FIXTURE_NAMES,
  MULTIPART_FIXTURE_NAME,
  readUploadProofState,
  REFUSED_FIXTURE_NAME,
  UPLOAD_FIXTURE_DIRECTORY,
  UPLOAD_PROOF_PATH,
  waitForUploadProofPhase,
  writeMultipartVideo,
  type UploadProofState,
} from "./support/uploadHarness.ts";

/**
 * The upload session end to end, in the installed Chrome and in WebKit,
 * against the local S3 stand-in: the step design's Verification 13.
 *
 * **It drives the engine through the harness page, not a surface.** Surface 8
 * is step 7b's; what this step built is the engine and the routes under it.
 * The end-to-end build includes `upload-proof.html` for exactly this reason
 * (`apps/web/vite.config.ts`), and no other build does.
 *
 * **Every assertion reads what the product wrote**: the catalog, the outbound
 * mail and the stand-in's log of what reached the bucket. The harness's own
 * record is read only for what only the browser knows, which is the order of
 * the engine's events and which completion settled the batch.
 *
 * Three tests: a mixed batch, a tab closed mid-transfer and reopened, and one
 * photograph picked twice, whose copy presign cancels.
 */

/** The tag the resume test plans before commit, through the route. */
const RESUME_TAG = "resumed batch";

/** The five committed media fixtures, as paths. */
const MEDIA_FIXTURE_PATHS = MEDIA_FIXTURE_NAMES.map((name) => {
  return join(UPLOAD_FIXTURE_DIRECTORY, name);
});

const test = base.extend<{ uploaderContext: BrowserContext }>({
  uploaderContext: async ({ browser, browserName }, provide) => {
    const context = await browser.newContext({
      storageState: getUploaderStorageState(browserName),
    });
    await closeOpenUploadSession(context.request);
    await provide(context);
    await context.close();
  },
});

test.skip(
  ({ channel }) => {
    return channel === "chrome" && !isGoogleChromeInstalled();
  },
  "Google Chrome is not installed. This project is the real browser on " +
    "purpose: Playwright's bundled Chromium decodes no HEVC, which is what a " +
    "phone records. Install Chrome, or run --project=upload-webkit.",
);

/** Opens the harness, picks these files, and waits for the phase. */
async function _pickInTheHarness(options: {
  page: Page;
  query: string;
  paths: readonly string[];
  phase: "held" | "finished";
}): Promise<UploadProofState> {
  await options.page.goto(`${UPLOAD_PROOF_PATH}?${options.query}`);
  await options.page
    .locator("input[type=file]")
    .setInputFiles([...options.paths]);
  return waitForUploadProofPhase({ page: options.page, phase: options.phase });
}

/** One bulk tag on every file, planned before commit through the route. */
async function _planOneTag(options: {
  request: APIRequestContext;
  sessionId: string;
  fileIds: readonly string[];
}): Promise<void> {
  const response = await options.request.post(
    `/api/upload-sessions/${options.sessionId}/edits`,
    {
      data: {
        kind: "tag",
        targetFileIds: options.fileIds,
        labelSnapshot: RESUME_TAG,
      },
    },
  );
  expect(response.status()).toBe(201);
}

/**
 * Lets the first two completions through and holds the third, handing it
 * back so the tab can drop it as it closes.
 *
 * **Held, then dropped, because that is what a closed tab leaves.** With one
 * transfer at a time, the third file's bytes are already in the bucket when
 * its completion is sent; holding it leaves the row `sending` and the server
 * never told. It is aborted just before the tab closes rather than left open,
 * because WebKit was measured letting a request held open across
 * `page.close()` through to the server, which then heard of the third file
 * after all. A retry the engine makes after the abort is aborted too.
 */
async function _holdTheThirdCompletion(
  page: Page,
): Promise<{ held: Promise<Route> }> {
  let completionCount = 0;
  let onHeld: (route: Route) => void = () => {};
  const held = new Promise<Route>((resolvePromise) => {
    onHeld = resolvePromise;
  });
  await page.route(
    "**/api/upload-sessions/*/files/*/complete",
    async (route) => {
      completionCount += 1;
      if (completionCount <= 2) {
        await route.continue();
      } else if (completionCount === 3) {
        onHeld(route);
      } else {
        await route.abort();
      }
    },
  );
  return { held };
}

/** `GET /api/upload-sessions/current`, which must name a batch. */
async function _readCurrentSession(
  request: APIRequestContext,
): Promise<UploadSessionDetail> {
  const response = await request.get("/api/upload-sessions/current");
  expect(response.status()).toBe(200);
  return uploadSessionDetailSchema.parse(await response.json());
}

/** The batch the closed tab left: two done, three to come, the plan intact. */
function _expectTheBatchSurvived(options: {
  current: Readonly<UploadSessionDetail>;
  sessionId: string;
}): void {
  const { current } = options;
  expect(current).toMatchObject({
    sessionId: options.sessionId,
    state: "uploading",
  });
  expect(current.progress.doneCount).toBe(2);
  expect(current.progress.sendingCount).toBeGreaterThanOrEqual(1);
  expect(current.progress.sendingCount + current.progress.waitingCount).toBe(3);
  expect(current.pendingFiles).toHaveLength(3);
  expect(current.edits).toEqual([
    expect.objectContaining({
      kind: "tag",
      label: RESUME_TAG,
      targetCount: 5,
      undoneAt: null,
    }),
  ]);
}

/**
 * Nothing that had landed was touched again. Each landed original reached
 * the bucket once, by the first tab, and no request made after the resume
 * began names a landed file at all: no re-presign, no second original, no
 * derivative sent again.
 */
function _expectNothingLandedTouched(options: {
  log: readonly FakeS3Request[];
  logLengthBeforeResume: number;
  sessionId: string;
  landedFileIds: ReadonlySet<string>;
}): void {
  const { log, sessionId, landedFileIds } = options;
  landedFileIds.forEach((fileId) => {
    const puts = getOriginalRequestsFromLog({ log, sessionId, fileId }).filter(
      (request) => {
        return request.operation === "PutObject";
      },
    );
    expect(puts, fileId).toEqual([
      expect.objectContaining({ operation: "PutObject", status: 200 }),
    ]);
  });
  const sinceResume = log.slice(options.logLengthBeforeResume);
  const touchingLanded = sinceResume.filter((request) => {
    return [...landedFileIds].some((fileId) => {
      return request.key.includes(fileId);
    });
  });
  expect(touchingLanded).toEqual([]);
}

/**
 * The second tab declared everything and sent only the three still missing:
 * the two that had landed matched by hash as `already_done`, and nothing of
 * theirs reached the bucket again.
 */
async function _expectOnlyTheMissingOnesSent(options: {
  resumed: Readonly<UploadProofState>;
  sessionId: string;
  landedFileIds: ReadonlySet<string>;
  logLengthBeforeResume: number;
}): Promise<void> {
  const { resumed, sessionId, landedFileIds } = options;
  expect(resumed).toMatchObject({ sessionId, isResume: true });
  resumed.outcomes.forEach((outcome) => {
    expect(outcome.disposition).toBe(
      landedFileIds.has(outcome.fileId) ? "already_done" : "matched",
    );
  });
  const sentNow = getEventsFromState({ state: resumed, kind: "file-done" }).map(
    (event) => {
      return event.fileId;
    },
  );
  expect(sentNow.sort()).toEqual(
    resumed.outcomes
      .map((outcome) => {
        return outcome.fileId;
      })
      .filter((fileId) => {
        return !landedFileIds.has(fileId);
      })
      .sort(),
  );
  _expectNothingLandedTouched({
    log: await readFakeS3Requests(),
    logLengthBeforeResume: options.logLengthBeforeResume,
    sessionId,
    landedFileIds,
  });
}

/**
 * Declares the five, plans one tag, commits, and closes the tab with two
 * landed and the third's completion never delivered.
 */
async function _closeTheTabMidBatch(context: BrowserContext): Promise<{
  sessionId: string;
  landedFileIds: Set<string>;
}> {
  const firstTab = await context.newPage();
  const declared = await _pickInTheHarness({
    page: firstTab,
    query: "concurrency=1&hold=before-commit",
    paths: MEDIA_FIXTURE_PATHS,
    phase: "held",
  });
  const sessionId = getSessionIdFromState(declared);
  const fileIds = declared.outcomes.map((outcome) => {
    return outcome.fileId;
  });
  await _planOneTag({ request: context.request, sessionId, fileIds });
  const { held } = await _holdTheThirdCompletion(firstTab);
  await firstTab.evaluate(() => {
    (
      window as unknown as { __uploadProof: { release: () => void } }
    ).__uploadProof.release();
  });
  const heldCompletion = await held;
  const landed = getEventsFromState({
    state: await readUploadProofState(firstTab),
    kind: "file-done",
  });
  await heldCompletion.abort();
  await firstTab.close();
  expect(landed).toHaveLength(2);
  expect(
    landed.some((event) => {
      return event.response.didSettle;
    }),
  ).toBe(false);
  const landedFileIds = new Set(
    landed.map((event) => {
      return event.fileId;
    }),
  );
  return { sessionId, landedFileIds };
}

test("a mixed batch goes up, lands on its days, and settles once", async ({
  uploaderContext,
}, testInfo) => {
  test.setTimeout(240_000);
  const multipartPath = testInfo.outputPath(MULTIPART_FIXTURE_NAME);
  const multipartBytes = writeMultipartVideo(multipartPath);
  try {
    const page = await uploaderContext.newPage();
    const proof = await _pickInTheHarness({
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
    await _closeTheTabMidBatch(uploaderContext);

  const current = await _readCurrentSession(uploaderContext.request);
  _expectTheBatchSurvived({ current, sessionId });

  const logLengthBeforeResume = (await readFakeS3Requests()).length;
  const resumed = await _pickInTheHarness({
    page: await uploaderContext.newPage(),
    query: "concurrency=1",
    paths: MEDIA_FIXTURE_PATHS,
    phase: "finished",
  });
  await _expectOnlyTheMissingOnesSent({
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
    const proof = await _pickInTheHarness({
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
