import type { MilestoneDetailResponse } from "../../../apps/web/src/api/milestoneHelpers/milestoneHelpers.types.ts";

import type {
  CreateUploadEditRequest,
  MilestoneRef,
  UploadSessionDetail,
} from "@memory-shoebox/shared";

import { makeSurfaceContractDetail } from "../uploadSurfaceTestHelpers/makeSurfaceContractDetail.ts";

import { expect, type Page, type Route } from "@playwright/test";

/** Shared scenario fixture. */
export const OCCASION: MilestoneRef = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Submitted occasion",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};
/** Shared scenario fixture. */
export const OCCASION_DETAIL: MilestoneDetailResponse = {
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
/** Shared scenario fixture. */
export function makePairDetail(): UploadSessionDetail {
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
/** Shared scenario fixture. */
export type OccasionContractOptions = {
  page: Page;
  detail: UploadSessionDetail;
  writes: CreateUploadEditRequest[];
  onCreate?: (route: Route) => Promise<void>;
  shouldRejectFirst?: boolean;
};
/** Shared scenario fixture. */
export async function installOccasionContract({
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
/** Shared scenario fixture. */
export async function createOccasion(page: Page): Promise<void> {
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
/** Shared scenario fixture. */
export async function makeDistinctImages(page: Page): Promise<Buffer[]> {
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
/** Shared scenario fixture. */
export async function expectIncomingColor({
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
