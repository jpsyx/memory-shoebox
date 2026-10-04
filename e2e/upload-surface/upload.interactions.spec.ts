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

test("surface 8 delayed creation survives actual route reentry with original targets", async ({
  uploaderPage: page,
}) => {
  const detail = _makePairDetail();
  await installSurfaceContractDetail({ page, detail });
  await page.getByRole("link", { name: "Back to the pile" }).click();
  await page.getByRole("link", { name: "Add", exact: true }).click();
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
  await page.getByRole("button", { name: /Family-1\.jpg/ }).click();
  await _createOccasion(page);
  await held.promise;
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Untick", exact: true }).click();
  await page.getByRole("button", { name: /Family-2\.jpg/ }).click();
  release.resolve();
  await expect
    .poll(() => {
      return writes.length;
    })
    .toBe(1);
  expect(writes[0]!.targetFileIds).toEqual([detail.files[0]!.fileId]);
  await expect(
    page.getByRole("button", { name: /Family-2\.jpg/ }),
  ).toHaveAttribute("aria-pressed", "true");
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
  await page.getByRole("button", { name: /Family-1\.jpg/ }).click();
  await _createOccasion(page);
  await expect(
    page.getByRole("button", { name: "Retry attachment" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close milestone picker" }).click();
  await page.getByRole("button", { name: "Untick", exact: true }).click();
  await page.getByRole("button", { name: /Family-2\.jpg/ }).click();
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
    await expect(
      page.getByRole("option", { name: /saved file 1, 2026-09-15/ }),
    ).toBeAttached();
    await expect(
      page.getByRole("option", { name: /saved file 2, 2026-09-17/ }),
    ).toBeAttached();
    await _expectIncomingColor({ page, channel: 0 });
    await page
      .getByRole("combobox", { name: "Saved original" })
      .selectOption(detail.files[1]!.fileId);
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
