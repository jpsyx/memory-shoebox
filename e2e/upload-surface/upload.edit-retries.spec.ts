import {
  uploadSessionDetailSchema,
  type CreateUploadEditRequest,
  type TagCount,
  type UploadBatchEditDto,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import type { MilestoneDetailResponse } from "../../apps/web/src/api/milestones/milestones.types.ts";
import { expect, type Page } from "@playwright/test";
import {
  installSurfaceContractDetail,
  makeSurfaceContractDetail,
  test,
} from "./uploadSurfaceTestHelpers.ts";

const TAGS: TagCount[] = [
  {
    tag: { tagId: "018f0000-0000-7000-8000-000000008000", name: "hospital" },
    itemCount: 2,
  },
  {
    tag: { tagId: "018f0000-0000-7000-8000-000000008001", name: "sleeping" },
    itemCount: 2,
  },
];
function _makeDetailFromCount(count: number): UploadSessionDetail {
  const detail = makeSurfaceContractDetail();
  const template = detail.files[0]!;
  detail.files = Array.from({ length: count }, (_, position) => {
    return {
      ...template,
      position,
      fileId: `018f0000-0000-7000-8000-${(position + 100).toString(16).padStart(12, "0")}`,
      originalFilename: `Family-${position + 1}.jpg`,
    };
  });
  detail.fileCount = count;
  detail.totalBytes = count * 1000;
  detail.progress.waitingCount = count;
  detail.days[0]!.fileCount = count;
  return detail;
}
function _makeOccasionFromPosition(position: number): MilestoneDetailResponse {
  return {
    milestone: {
      milestoneId: `018f0000-0000-7000-8000-${(8000 + position).toString(16).padStart(12, "0")}`,
      name: `Occasion ${position + 1}`,
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
      blurb: null,
    },
    itemCount: 0,
    dayCount: 1,
    canEdit: true,
    canDelete: true,
    mismatchCount: 0,
    createdBy: null,
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
  };
}
function _makeEditFromRequest(
  options: Readonly<{
    body: CreateUploadEditRequest;
    detail: UploadSessionDetail;
    occasion?: MilestoneDetailResponse;
  }>,
): UploadBatchEditDto {
  const { body, detail, occasion } = options;
  const tag = TAGS.find((entry) => {
    return entry.tag.tagId === body.tagId;
  })?.tag;
  return {
    editId: `018f0000-0000-7000-8000-${(9000 + detail.edits.length).toString(16).padStart(12, "0")}`,
    kind: body.kind,
    label: tag?.name ?? occasion!.milestone.name,
    tag: tag ?? null,
    person: null,
    milestone: occasion?.milestone ?? null,
    targetCount: body.targetFileIds.length,
    createdAt: "2026-10-03T00:00:00.000Z",
    undoneAt: null,
    appliedAt: null,
    canUndo: true,
  };
}
async function _installUndoContract(
  options: Readonly<{ page: Page; detail: UploadSessionDetail }>,
): Promise<void> {
  await options.page.route(
    "**/api/upload-sessions/*/edits/*",
    async (route) => {
      const editId = new URL(route.request().url()).pathname.split("/").at(-1);
      const edit = options.detail.edits.find((saved) => {
        return saved.editId === editId;
      })!;
      edit.undoneAt = "2026-10-04T00:00:00.000Z";
      edit.canUndo = false;
      await route.fulfill({ json: edit });
    },
  );
}

test("surface 8 client contract changed existing occasion is a new submitted action after rejection", async ({
  uploaderPage: page,
}) => {
  const detail = _makeDetailFromCount(2);
  await installSurfaceContractDetail({ page, detail });
  const occasions = [
    _makeOccasionFromPosition(0),
    _makeOccasionFromPosition(1),
  ];
  await page.route("**/api/milestones**", (route) => {
    return route.fulfill({ json: { milestones: occasions, nextCursor: null } });
  });
  const writes: CreateUploadEditRequest[] = [];
  await page.route("**/api/upload-sessions/*/edits", async (route) => {
    const body = route.request().postDataJSON() as CreateUploadEditRequest;
    writes.push(body);
    if (writes.length === 1) {
      await route.fulfill({
        status: 429,
        json: { error: "rate_limited", message: "Retry attachment later" },
      });
      return;
    }
    const occasion = occasions.find((entry) => {
      return entry.milestone.milestoneId === body.milestoneId;
    })!;
    const edit = _makeEditFromRequest({ body, detail, occasion });
    detail.edits.push(edit);
    await route.fulfill({ status: 201, json: edit });
  });
  await page.getByRole("button", { name: /Family-1\.jpg/ }).click();
  await page
    .getByRole("button", { name: "Put under a milestone", exact: true })
    .click();
  await page.getByRole("button", { name: /Occasion 1/ }).click();
  await page.getByRole("button", { name: "Attach 1", exact: true }).click();
  await expect(page.getByRole("alert").last()).toContainText(
    "Retry attachment later",
  );
  await page.getByRole("button", { name: /Occasion 2/ }).click();
  await page.getByRole("button", { name: "Attach 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    writes.map((body) => {
      return { milestoneId: body.milestoneId, targets: body.targetFileIds };
    }),
  ).toEqual([
    {
      milestoneId: occasions[0]!.milestone.milestoneId,
      targets: [detail.files[0]!.fileId],
    },
    {
      milestoneId: occasions[1]!.milestone.milestoneId,
      targets: [detail.files[0]!.fileId],
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Undo Occasion 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo Occasion 1", exact: true }),
  ).toHaveCount(0);
});

async function _installPagedRetryDetail(
  options: Readonly<{ page: Page; detail: UploadSessionDetail }>,
): Promise<void> {
  await options.page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const start = Number(
      new URL(route.request().url()).searchParams.get("cursor") ?? 0,
    );
    const end = start + 500;
    await route.fulfill({
      json: uploadSessionDetailSchema.parse({
        ...options.detail,
        files: options.detail.files.slice(start, end),
        nextCursor: end < options.detail.files.length ? String(end) : null,
      }),
    });
  });
  await options.page.goto("/upload");
  await expect(
    options.page.getByRole("button", { name: "Put 1,001 up", exact: true }),
  ).toBeVisible();
}
async function _chooseTags(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Tick all 1001", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a tag", exact: true }).click();
  const field = page.getByRole("combobox", { name: "Tags", exact: true });
  await field.fill("hospital");
  await field.press("Enter");
  await field.fill("sleeping");
  await field.press("Enter");
  await field.press("Tab");
}
async function _submitForRetry(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Tag all 1001", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Retry label later",
  );
  await expect(
    page.getByRole("button", { name: "Tag all 1001", exact: true }),
  ).toBeEnabled();
}
async function _expectSavedLabelsAndUndo(page: Page): Promise<void> {
  const savedPlan = page.getByRole("region", { name: "What you have added" });
  await expect(
    savedPlan.getByRole("button", { name: "Undo hospital", exact: true }),
  ).toHaveCount(2);
  await expect(
    savedPlan.getByRole("button", { name: "Undo sleeping", exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /Family-1\.jpg/ }),
  ).toContainText("2 saved labels");
  await savedPlan
    .getByRole("button", { name: "Undo hospital", exact: true })
    .first()
    .click();
  await expect(
    savedPlan.getByRole("button", { name: "Undo hospital", exact: true }),
  ).toHaveCount(1);
  await savedPlan
    .getByRole("button", { name: "Undo hospital", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Family-1\.jpg/ }),
  ).toContainText("1 saved label");
  await savedPlan
    .getByRole("button", { name: "Undo sleeping", exact: true })
    .first()
    .click();
  await expect(
    savedPlan.getByRole("button", { name: "Undo sleeping", exact: true }),
  ).toHaveCount(1);
  await savedPlan
    .getByRole("button", { name: "Undo sleeping", exact: true })
    .click();
  await expect(savedPlan).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Family-1\.jpg/ }),
  ).not.toContainText("1 saved label");
}

test("surface 8 client contract multi-label chunk retries keep completed actions out of pending input", async ({
  uploaderPage: page,
}) => {
  const detail = _makeDetailFromCount(1001);
  await _installPagedRetryDetail({ page, detail });
  await page.route("**/api/tags**", (route) => {
    return route.fulfill({ json: { tags: TAGS, nextCursor: null } });
  });
  const writes: CreateUploadEditRequest[] = [];
  await page.route("**/api/upload-sessions/*/edits", async (route) => {
    const body = route.request().postDataJSON() as CreateUploadEditRequest;
    writes.push(body);
    if (writes.length === 2 || writes.length === 4) {
      await route.fulfill({
        status: 429,
        json: { error: "rate_limited", message: "Retry label later" },
      });
      return;
    }
    const edit = _makeEditFromRequest({ body, detail });
    detail.edits.push(edit);
    await route.fulfill({ status: 201, json: edit });
  });
  await _installUndoContract({ page, detail });
  await _chooseTags(page);
  await _submitForRetry(page);
  await expect(
    page.getByRole("dialog").getByText("hospital", { exact: true }),
  ).toBeVisible();
  await _submitForRetry(page);
  await expect(
    page.getByRole("dialog").getByText("hospital", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog").getByText("sleeping", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tag all 1001", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    writes.map((body) => {
      return [body.tagId, body.targetFileIds.length];
    }),
  ).toEqual([
    [TAGS[0]!.tag.tagId, 1000],
    [TAGS[0]!.tag.tagId, 1],
    [TAGS[0]!.tag.tagId, 1],
    [TAGS[1]!.tag.tagId, 1000],
    [TAGS[1]!.tag.tagId, 1000],
    [TAGS[1]!.tag.tagId, 1],
  ]);
  expect(writes[0]!.targetFileIds).toEqual(
    detail.files.slice(0, 1000).map((file) => {
      return file.fileId;
    }),
  );
  expect(writes[2]!.targetFileIds).toEqual([detail.files[1000]!.fileId]);
  expect(writes[4]!.targetFileIds).toEqual(writes[0]!.targetFileIds);
  expect(writes[5]!.targetFileIds).toEqual(writes[2]!.targetFileIds);
  await _expectSavedLabelsAndUndo(page);
  expect(
    detail.edits.filter((edit) => {
      return edit.undoneAt === null;
    }),
  ).toEqual([]);
});
