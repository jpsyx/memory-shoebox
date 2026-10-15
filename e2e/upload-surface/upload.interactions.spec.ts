import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import { makeSurfaceMatrixDetailFromState } from "./uploadSurfaceTestHelpers/makeSurfaceMatrixDetailFromState.ts";
import type { MilestoneDetailResponse } from "../../apps/web/src/api/milestoneHelpers/milestoneHelpers.types.ts";
import type {
  MilestoneRef,
  CreateUploadEditRequest,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { makeSurfaceContractDetail } from "./uploadSurfaceTestHelpers/makeSurfaceContractDetail.ts";
import { expect, type Page, type Route } from "@playwright/test";
import {
  expectSurfaceContrast,
  expectSurfaceControlsUnclipped,
} from "./uploadSurfaceLayoutHelpers.ts";
import {
  installSurfaceContractDetail,
  getSurfaceSessionFromRequest,
  test,
} from "./uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";

const OCCASION: MilestoneRef = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Submitted occasion",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};
const OCCASION_DETAIL: MilestoneDetailResponse = {
  milestone: OCCASION,
  itemCount: 0,
  dayCount: 1,
  canEdit: true,
  canDelete: true,
  mismatchCount: 0,
  createdBy: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};
function _makePairDetail(): UploadSessionDetail {
  const detail = makeSurfaceContractDetail();
  return {
    ...detail,
    files: detail.files.slice(0, 2),
    fileCount: 2,
    totalBytes: 2000,
    progress: { ...detail.progress, waitingCount: 2 },
    days: detail.days.map((day, position) => {
      return position === 0 ? { ...day, fileCount: 2 } : day;
    }),
  };
}
type OccasionContractOptions = {
  page: Page;
  detail: UploadSessionDetail;
  writes: CreateUploadEditRequest[];
  onCreate?: (route: Route) => Promise<void>;
  shouldRejectFirst?: boolean;
};
async function _installOccasionContract({
  page,
  detail,
  writes,
  onCreate,
  shouldRejectFirst,
}: Readonly<OccasionContractOptions>): Promise<void> {
  await page.route("**/api/milestones**", async (route) => {
    if (route.request().method() === "POST" && onCreate) {
      await onCreate(route);
    } else {
      await route.fulfill({
        json:
          route.request().method() === "GET"
            ? { milestones: [OCCASION_DETAIL], nextCursor: null }
            : OCCASION_DETAIL,
      });
    }
  });
  await page.route("**/api/upload-sessions/*/edits", async (route) => {
    const body = route.request().postDataJSON() as CreateUploadEditRequest;
    writes.push(body);
    if (shouldRejectFirst && writes.length === 1) {
      await route.fulfill({
        status: 429,
        json: {
          error: { code: "rate_limited", message: "Try attachment again" },
        },
      });
      return;
    }
    const edit = {
      editId: "018f0000-0000-7000-8000-000000009000",
      kind: "milestone" as const,
      label: OCCASION.name,
      tag: null,
      person: null,
      milestone: OCCASION,
      targetCount: body.targetFileIds.length,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    detail.edits = [edit];
    await route.fulfill({ status: 201, json: edit });
  });
}
async function _createOccasion(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Put under a milestone", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create a new milestone for these" })
    .click();
  await page
    .getByRole("textbox", { name: "What happened", exact: true })
    .fill(OCCASION.name);
  await page
    .getByRole("button", { name: "Create it and attach 1", exact: true })
    .click();
}

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
    if (route.request().method() === "DELETE")
      cancelled.push(new URL(route.request().url()).pathname);
    await route.continue();
  });
  const writes: CreateUploadEditRequest[] = [];
  const held = Promise.withResolvers<Route>();
  const release = Promise.withResolvers<void>();
  await _installOccasionContract({
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
  await _createOccasion(page);
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
  const detail = _makePairDetail();
  await installSurfaceContractDetail({ page, detail });
  const writes: CreateUploadEditRequest[] = [];
  const held = Promise.withResolvers<Route>();
  const release = Promise.withResolvers<void>();
  await _installOccasionContract({
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
  await _createOccasion(page);
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
  const detail = _makePairDetail();
  await installSurfaceContractDetail({ page, detail });
  const writes: CreateUploadEditRequest[] = [];
  await _installOccasionContract({
    page,
    detail,
    writes,
    shouldRejectFirst: true,
  });
  await page
    .getByRole("button", { name: /Family-1\.jpg/ })
    .and(page.locator("[aria-pressed]"))
    .click();
  await _createOccasion(page);
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

(["tag", "person"] as const).forEach((kind) => {
  test(`surface 8 immediate ${kind} typing and insertion keep one whole token`, async ({
    uploaderPage: page,
  }) => {
    await installSurfaceContractDetail({ page, detail: _makePairDetail() });
    await page.getByRole("button", { name: "Tick all 2", exact: true }).click();
    await page
      .getByRole("button", {
        name: kind === "tag" ? "Add a tag" : "Tag somebody",
        exact: true,
      })
      .click();
    const input = page.getByRole("combobox", {
      name: kind === "tag" ? "Tags" : "Who is in them",
      exact: true,
    });
    await expect(input).toBeFocused();
    await page.keyboard.type("Immediate", { delay: 15 });
    await page.keyboard.insertText(" complete token");
    await expect(input).toHaveValue("Immediate complete token");
    await expect(input).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Immediate complete token", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Immediate", { exact: true })).toHaveCount(0);
  });
});

async function _makeDistinctImages(page: Page): Promise<Buffer[]> {
  const urls = await page.evaluate(() => {
    return ["#ff0000", "#0000ff"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 30;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 40, 30);
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
  });
  const buffers = urls.map((url) => {
    return Buffer.from(url, "base64");
  });
  const size = Math.max(
    ...buffers.map((buffer) => {
      return buffer.length;
    }),
  );
  return buffers.map((buffer) => {
    return Buffer.concat([buffer, Buffer.alloc(size - buffer.length)]);
  });
}
async function _expectIncomingColor({
  page,
  channel,
}: Readonly<{ page: Page; channel: number }>): Promise<void> {
  const image = page.getByRole("img", { name: "Chosen original: same.png" });
  await expect(image).toBeVisible();
  await expect
    .poll(async () => {
      return image.evaluate((element, colorChannel) => {
        const imageElement = element as HTMLImageElement;
        if (!imageElement.complete || !imageElement.naturalWidth) {
          return 0;
        }
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.drawImage(imageElement, 0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[colorChannel];
      }, channel);
    })
    .toBeGreaterThan(200);
}
(["light", "dark"] as const).forEach((scheme) => {
  test(`surface 8 ${scheme} mobile equal-name equal-size originals expose identity and safe skip`, async ({
    uploaderPage: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const buffers = await _makeDistinctImages(page);
    expect(buffers[0]!.equals(buffers[1]!)).toBe(false);
    expect(buffers[0]!.length).toBe(buffers[1]!.length);
    const detail = _makePairDetail();
    detail.state = "uploading";
    detail.files = detail.files.map((file, position) => {
      return {
        ...file,
        originalFilename: "same.png",
        declaredContentType: "image/png",
        declaredBytes: buffers[0]!.length,
        capturedOn: position === 0 ? "2026-09-15" : "2026-09-17",
      };
    });
    await installSurfaceContractDetail({ page, detail });
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() !== "GET" &&
        request.url().includes("/api/upload-sessions")
      ) {
        mutations.push(request.url());
      }
    });
    await page.locator("input[type=file]").setInputFiles(
      buffers.map((buffer) => {
        return {
          name: "same.png",
          mimeType: "image/png",
          buffer,
        };
      }),
    );
    await expect(
      page.getByText("Chosen file 1 of 2: same.png", { exact: true }),
    ).toBeVisible();
    await _expectIncomingColor({ page, channel: 0 });
    await page.getByRole("combobox", { name: "Saved original" }).click();
    await expect(
      page.getByRole("option", { name: /saved file 1, 2026-09-15/ }),
    ).toBeAttached();
    await expect(
      page.getByRole("option", { name: /saved file 2, 2026-09-17/ }),
    ).toBeAttached();
    await page
      .getByRole("option", { name: /saved file 2, 2026-09-17/ })
      .click();
    await expectSurfaceContrast(page);
    await expectSurfaceControlsUnclipped(page);
    await page.screenshot({
      path: `.playwright-mcp/final-fix-logs/incoming-red-${scheme}-${testInfo.project.name}.png`,
    });
    await page.getByRole("button", { name: "Skip this chosen file" }).click();
    await expect(
      page.getByText("Chosen file 2 of 2: same.png", { exact: true }),
    ).toBeVisible();
    await _expectIncomingColor({ page, channel: 2 });
    await page.screenshot({
      path: `.playwright-mcp/final-fix-logs/incoming-blue-${scheme}-${testInfo.project.name}.png`,
    });
    await page.getByRole("button", { name: "Skip this chosen file" }).click();
    await expect(
      page.getByRole("combobox", { name: "Saved original" }),
    ).toHaveCount(0);
    expect(mutations).toEqual([]);
    await expect(
      page.getByRole("button", { name: "Choose the files again" }),
    ).toBeVisible();
  });
});

test("surface 8 canonical settled refresh preserves the already focused receipt action", async ({
  uploaderPage: page,
}) => {
  const detail = makeSurfaceMatrixDetailFromState("done");
  const canonicalNavigation = Promise.withResolvers<void>();
  const allowNavigation = Promise.withResolvers<void>();
  const refreshStarted = Promise.withResolvers<void>();
  const allowRefresh = Promise.withResolvers<void>();
  let bootstraps = 0;
  let addressedReads = 0;
  await page.route("**/api/bootstrap", async (route) => {
    bootstraps += 1;
    if (bootstraps === 2) {
      canonicalNavigation.resolve();
      await allowNavigation.promise;
    }
    await route.continue();
  });
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith(detail.sessionId)) {
      addressedReads += 1;
      if (addressedReads === 2) {
        refreshStarted.resolve();
        await allowRefresh.promise;
      }
    }
    await route.fulfill({ json: detail });
  });
  try {
    await page.goto("/upload");
    const action = page.getByRole("link", {
      name: "See them on the timeline",
      exact: true,
    });
    await action.focus();
    await expect(action).toBeFocused();
    const original = await action.elementHandle();
    await canonicalNavigation.promise;
    allowNavigation.resolve();
    await refreshStarted.promise;
    expect(
      await original!.evaluate((node) => {
        return node.isConnected;
      }),
    ).toBe(true);
    await expect(action).toBeFocused();
    allowRefresh.resolve();
    await expect(
      page.getByRole("button", { name: "Upload more", exact: true }),
    ).toBeEnabled();
    await expect(action).toBeFocused();
    expect(
      await original!.evaluate((node) => {
        return node.isConnected;
      }),
    ).toBe(true);
  } finally {
    allowNavigation.resolve();
    allowRefresh.resolve();
  }
});
