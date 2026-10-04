import {
  uploadSessionDetailSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import {
  test as base,
  expect,
  type APIRequestContext as ApiRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  closeOpenUploadSession,
  getUploaderStorageStateFromBrowserName,
} from "../../support/uploadHarnessHelpers.ts";

/**
 * Fresh browser state per surface case; the server batch is closed on
 * teardown.
 */
export const test = base.extend<{
  uploaderContext: BrowserContext;
  uploaderPage: Page;
}>({
  uploaderContext: async (
    { browser, browserName, baseURL: baseUrl },
    provide,
  ) => {
    const context = await browser.newContext({
      baseURL: baseUrl,
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

/**
 * Serves a DTO validated by the same shared schema the actual client
 * consumes.
 */
export async function installSurfaceContractDetail({
  page,
  detail,
}: Readonly<{ page: Page; detail: UploadSessionDetail }>): Promise<void> {
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: uploadSessionDetailSchema.parse(detail) });
    } else {
      await route.continue();
    }
  });
  await page.goto("/upload");
  await expect(
    page.getByRole("button", {
      name: `Put ${detail.fileCount} up`,
      exact: true,
    }),
  ).toBeVisible();
}

/**
 * Reads the complete manifest from the server, following its actual cursors.
 */
export async function getSurfaceSessionFromRequest(
  options: Readonly<{ request: ApiRequestContext; sessionId?: string }>,
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
    request: ApiRequestContext;
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
type AddSurfaceLabelOptions = {
  page: Page;
  kind: "tag" | "person";
  name: string;
  selectedFileCount: number;
};

/** Applies a new bulk label through the ordinary edit modal. */
export async function addSurfaceLabel(
  options: Readonly<AddSurfaceLabelOptions>,
): Promise<void> {
  const { page, kind, name, selectedFileCount } = options;
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
    .getByRole("button", { name: `Tag all ${selectedFileCount}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
}
