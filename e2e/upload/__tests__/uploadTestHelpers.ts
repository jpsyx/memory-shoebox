import { join } from "node:path";
import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import { type UploadSessionDetail } from "@memory-shoebox/shared";

import type { FakeS3Request } from "../../support/createFakeS3Server/createFakeS3Server.types.ts";
import {
  getOriginalRequestsFromLog,
  readFakeS3Requests,
} from "../../support/uploadCatalogHelpers.ts";

import {
  closeOpenUploadSession,
  getEventsFromState,
  getSessionIdFromState,
  getUploaderStorageStateFromBrowserName,
  MEDIA_FIXTURE_NAMES,
  readUploadProofState,
  UPLOAD_FIXTURE_DIRECTORY,
  UPLOAD_PROOF_PATH,
  waitForUploadProofPhase,
  type UploadProofState,
} from "../../support/uploadHarnessHelpers.ts";

/** Inputs for _pickInTheHarness. */
export type PickInTheHarnessOptions = {
  page: Page;
  query: string;
  paths: string[];
  phase: "held" | "finished";
};

/** Inputs for _expectNothingLandedTouched. */
export type ExpectNothingLandedTouchedOptions = {
  log: FakeS3Request[];
  logLengthBeforeResume: number;
  sessionId: string;
  landedFileIds: Set<string>;
};

/** Inputs for _expectOnlyTheMissingOnesSent. */
export type ExpectOnlyTheMissingOnesSentOptions = {
  resumed: UploadProofState;
  sessionId: string;
  landedFileIds: Set<string>;
  logLengthBeforeResume: number;
};

/**
 * The upload session end to end, in the installed Chrome and in WebKit, against
 * the local S3 stand-in.
 *
 * It drives the headless engine through the harness page. The product upload
 * interface is separate; these tests exercise the engine and routes. The
 * end-to-end build includes `upload-proof.html` for exactly this reason
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
export const RESUME_TAG = "resumed batch";

/** The five committed media fixtures, as paths. */
export const MEDIA_FIXTURE_PATHS = MEDIA_FIXTURE_NAMES.map((name) => {
  return join(UPLOAD_FIXTURE_DIRECTORY, name);
});

/**
 * Playwright test with a signed-in uploader browser context.
 */
export const test = base.extend<{ uploaderContext: BrowserContext }>({
  uploaderContext: async ({ browser, browserName }, provide) => {
    const context = await browser.newContext({
      storageState: getUploaderStorageStateFromBrowserName(browserName),
    });
    await closeOpenUploadSession(context.request);
    await provide(context);
    await context.close();
  },
});

/** Opens the harness, picks these files, and waits for the phase. */
export async function pickInTheHarness(
  options: Readonly<Omit<PickInTheHarnessOptions, "paths">> &
    Readonly<{ paths: readonly string[] }>,
): Promise<UploadProofState> {
  await options.page.goto(`${UPLOAD_PROOF_PATH}?${options.query}`);
  await options.page
    .locator("input[type=file]")
    .setInputFiles([...options.paths]);
  return waitForUploadProofPhase({ page: options.page, phase: options.phase });
}

/** One bulk tag on every file, planned before commit through the route. */
export async function planOneTag(
  options: Readonly<{
    request: APIRequestContext;
    sessionId: string;
    fileIds: readonly string[];
  }>,
): Promise<void> {
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
export async function holdTheThirdCompletion(
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

/** The batch the closed tab left: two done, three to come, the plan intact. */
export function expectTheBatchSurvived(
  options: Readonly<{
    current: Readonly<UploadSessionDetail>;
    sessionId: string;
  }>,
): void {
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
export function expectNothingLandedTouched(
  options: Readonly<
    Omit<ExpectNothingLandedTouchedOptions, "log" | "landedFileIds">
  > &
    Readonly<{
      log: readonly FakeS3Request[];
      landedFileIds: ReadonlySet<string>;
    }>,
): void {
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
export async function expectOnlyTheMissingOnesSent(
  options: Readonly<
    Omit<ExpectOnlyTheMissingOnesSentOptions, "resumed" | "landedFileIds">
  > &
    Readonly<{
      resumed: Readonly<UploadProofState>;
      landedFileIds: ReadonlySet<string>;
    }>,
): Promise<void> {
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
  expectNothingLandedTouched({
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
export async function closeTheTabMidBatch(context: BrowserContext): Promise<{
  sessionId: string;
  landedFileIds: Set<string>;
}> {
  const firstTab = await context.newPage();
  const declared = await pickInTheHarness({
    page: firstTab,
    query: "concurrency=1&hold=before-commit",
    paths: MEDIA_FIXTURE_PATHS,
    phase: "held",
  });
  const sessionId = getSessionIdFromState(declared);
  const fileIds = declared.outcomes.map((outcome) => {
    return outcome.fileId;
  });
  await planOneTag({ request: context.request, sessionId, fileIds });
  const { held } = await holdTheThirdCompletion(firstTab);
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
