import {
  expect,
  test as base,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import {
  uploadSessionDetailSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import {
  closeOpenUploadSession,
  getUploaderStorageStateFromBrowserName,
} from "../support/uploadHarnessHelpers.ts";
import { makeUploadSessionDetail } from "../../apps/web/src/testing/makeUploadSessionDetail.ts";

/** Fresh browser state per surface case; the server batch is closed on teardown. */
export const test = base.extend<{
  uploaderContext: BrowserContext;
  uploaderPage: Page;
}>({
  uploaderContext: async ({ browser, browserName, baseURL }, provide) => {
    const context = await browser.newContext({
      baseURL,
      storageState: getUploaderStorageStateFromBrowserName(browserName),
    });
    await closeOpenUploadSession(context.request);
    try {
      await provide(context);
    } finally {
      await Promise.all(
        context.pages().map((page) => {
          return page.close();
        }),
      );
      await closeOpenUploadSession(context.request);
      await context.close();
    }
  },
  uploaderPage: async ({ uploaderContext }, provide) => {
    const page = await uploaderContext.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto("/upload");
    await expect(
      page.getByRole("heading", { name: "Put it all up." }),
    ).toBeVisible();
    await provide(page);
  },
});

/** Uses the actual native input on surface 8, with no engine harness. */
export async function pickFilesInUploadSurface(
  options: Readonly<{ page: Page; paths: readonly string[] }>,
): Promise<void> {
  await options.page
    .locator("input[type=file]")
    .setInputFiles([...options.paths]);
}

/** Controlled contract state for frontend-only missing milestone/directory paths. */
export function makeSurfaceContractDetail(): UploadSessionDetail {
  const detail = makeUploadSessionDetail();
  detail.files = Array.from({ length: 12 }, (_, position) => {
    return {
      fileId: `018f0000-0000-7000-8000-${(position + 100).toString(16).padStart(12, "0")}`,
      position,
      originalFilename: `Family-${position + 1}.jpg`,
      declaredContentType: "image/jpeg",
      declaredBytes: 1000,
      contentHash: null,
      state: "waiting" as const,
      attemptCount: 0,
      problemCode: null,
      problemDetail: null,
      capturedAt: "2026-09-17T12:00:00.000Z",
      capturedOn: "2026-09-17",
      captureOffsetMinutes: 0,
      captureSource: "exif" as const,
      itemId: null,
      media: null,
    };
  });
  detail.fileCount = 12;
  detail.totalBytes = 12000;
  detail.progress.waitingCount = 12;
  detail.days = [{ capturedOn: "2026-09-17", fileCount: 12, milestones: [] }];
  return detail;
}

/** Serves a DTO validated by the same shared schema the actual client consumes. */
export async function installSurfaceContractDetail(
  page: Page,
  detail: UploadSessionDetail,
): Promise<void> {
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({ json: uploadSessionDetailSchema.parse(detail) });
    else await route.continue();
  });
  await page.goto("/upload");
  await expect(
    page.getByRole("button", {
      name: `Put ${detail.fileCount} up`,
      exact: true,
    }),
  ).toBeVisible();
}

/** Reads the complete manifest from the server, following its actual cursors. */
export async function readSurfaceSession(
  options: Readonly<{ request: APIRequestContext; sessionId?: string }>,
): Promise<UploadSessionDetail> {
  const path = options.sessionId
    ? `/api/upload-sessions/${options.sessionId}`
    : "/api/upload-sessions/current";
  const response = await options.request.get(path);
  expect(response.status()).toBe(200);
  const detail = uploadSessionDetailSchema.parse(await response.json());
  return _readRemainingSurfacePages({ request: options.request, detail });
}

async function _readRemainingSurfacePages(
  options: Readonly<{
    request: APIRequestContext;
    detail: UploadSessionDetail;
  }>,
): Promise<UploadSessionDetail> {
  const { request, detail } = options;
  if (detail.nextCursor === null) {
    return detail;
  }
  const response = await request.get(
    `/api/upload-sessions/${detail.sessionId}?cursor=${encodeURIComponent(detail.nextCursor)}`,
  );
  expect(response.status()).toBe(200);
  const following = uploadSessionDetailSchema.parse(await response.json());
  return _readRemainingSurfacePages({
    request,
    detail: {
      ...detail,
      files: [...detail.files, ...following.files],
      nextCursor: following.nextCursor,
    },
  });
}

/** Applies a new bulk label through the ordinary edit modal. */
export async function addSurfaceLabel(
  options: Readonly<{
    page: Page;
    kind: "tag" | "person";
    name: string;
    count: number;
  }>,
): Promise<void> {
  const { page, kind, name, count } = options;
  await page
    .getByRole("button", {
      name: kind === "tag" ? "Add a tag" : "Tag somebody",
      exact: true,
    })
    .click();
  const field = page.getByRole("combobox", {
    name: kind === "tag" ? "Tags" : "Who is in them",
    exact: true,
  });
  await field.fill(name);
  await field.press("Enter");
  await field.press("Tab");
  await page
    .getByRole("button", { name: `Tag all ${count}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
}

const OCCASION = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

/** Validated complete manifest for browser-only visual comparisons. */
export function makeSurfaceMatrixDetailFromState(
  state: string,
): UploadSessionDetail {
  const detail = makeSurfaceContractDetail();
  const template = detail.files[0]!;
  detail.files = Array.from({ length: 264 }, (_, position) => {
    return {
      ...template,
      fileId: `018f0000-0000-7000-8000-${(position + 100).toString(16).padStart(12, "0")}`,
      position,
      originalFilename: `Family-${position + 1}.jpg`,
      capturedOn:
        position < 12
          ? "2026-09-17"
          : position < 138
            ? "2026-09-15"
            : "2026-09-12",
    };
  });
  detail.fileCount = 264;
  detail.totalBytes = 264000;
  detail.progress.waitingCount = 264;
  detail.days = [
    { capturedOn: "2026-09-17", fileCount: 12, milestones: [] },
    { capturedOn: "2026-09-15", fileCount: 126, milestones: [] },
    { capturedOn: "2026-09-12", fileCount: 126, milestones: [] },
  ];
  _applyMatrixPlan(detail, state);
  _applyMatrixOutcome(detail, state);
  return uploadSessionDetailSchema.parse(detail);
}

function _applyMatrixPlan(detail: UploadSessionDetail, state: string): void {
  const kinds =
    state === "tagged"
      ? ["tag"]
      : state === "people-tagged"
        ? ["tag", "person"]
        : ["milestone-assigned", "milestone-fix", "resume"].includes(state)
          ? ["tag", "person", "milestone"]
          : [];
  detail.edits = kinds.map((kind, position) => {
    return {
      editId: `018f0000-0000-7000-8000-${(position + 900).toString(16).padStart(12, "0")}`,
      kind: kind as "tag" | "person" | "milestone",
      label:
        kind === "tag"
          ? "hospital"
          : kind === "person"
            ? "Mateo"
            : OCCASION.name,
      tag: null,
      person: null,
      milestone: kind === "milestone" ? OCCASION : null,
      targetCount: 12,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
  });
  if (kinds.includes("milestone")) {
    detail.days[0]!.milestones = [OCCASION];
  }
  _applyMatrixDateGroups(detail, state);
}

function _applyMatrixDateGroups(
  detail: UploadSessionDetail,
  state: string,
): void {
  if (state === "milestone-fix") {
    detail.mismatches = [
      {
        milestone: OCCASION,
        files: detail.files
          .slice(12, 16)
          .map(({ fileId, originalFilename, capturedOn }) => {
            return {
              fileId,
              originalFilename,
              capturedOn: capturedOn!,
            };
          }),
      },
    ];
  }
  if (state === "undated") {
    detail.files[0]!.captureSource = "file_mtime";
    detail.undated = {
      fileCount: 1,
      captureSource: "file_mtime",
      files: [
        {
          fileId: detail.files[0]!.fileId,
          originalFilename: detail.files[0]!.originalFilename,
          capturedOn: "2026-09-17",
        },
      ],
    };
  }
}

function _applyMatrixOutcome(detail: UploadSessionDetail, state: string): void {
  if (state === "resume") {
    detail.state = "uploading";
    detail.files = detail.files.map((file, position) => {
      return {
        ...file,
        state: position < 200 ? "done" : "waiting",
      };
    });
    detail.progress = {
      ...detail.progress,
      waitingCount: 64,
      doneCount: 200,
      doneBytes: 200000,
    };
  }
  _applyMatrixSettledOutcome(detail, state);
}

function _applyMatrixSettledOutcome(
  detail: UploadSessionDetail,
  state: string,
): void {
  if (state === "done" || state === "partial") {
    detail.state = "settled";
    detail.files = detail.files.map((file, position) => {
      return {
        ...file,
        state:
          state === "partial" && position === 262
            ? "failed"
            : state === "partial" && position === 263
              ? "refused"
              : "done",
        problemCode:
          state === "partial" && position >= 262
            ? position === 262
              ? "connection_lost"
              : "unsupported_type"
            : null,
      };
    });
    detail.progress = {
      ...detail.progress,
      waitingCount: 0,
      doneCount: state === "done" ? 264 : 262,
      failedCount: state === "partial" ? 1 : 0,
      refusedCount: state === "partial" ? 1 : 0,
      doneBytes: state === "done" ? 264000 : 262000,
    };
    detail.summary = {
      itemCount: detail.progress.doneCount,
      dayCount: 3,
      milestoneCount: 2,
      burstCount: 1,
      burstFrameCount: 45,
      notifiedMemberCount: 4,
    };
  }
}
