import type {
  CreateUploadEditRequest,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { expect, type Page } from "@playwright/test";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import {
  installSurfaceContractDetail,
  makeSurfaceContractDetail,
  pickFilesInUploadSurface,
  readSurfaceSession,
  test,
} from "./uploadSurfaceTestHelpers.ts";

const MILESTONE_ID = "018f0000-0000-7000-8000-000000008000";
const MEMBER_ID = "018f0000-0000-7000-8000-000000008001";
const GROUP_ID = "018f0000-0000-7000-8000-000000008002";
const OCCASION = {
  milestoneId: MILESTONE_ID,
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};
const MILESTONE_DETAIL = {
  milestone: OCCASION,
  itemCount: 12,
  dayCount: 1,
  canEdit: true,
  canDelete: true,
  mismatchCount: 0,
  createdBy: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

test("surface 8 client contract inline milestone creation retries only attachment", async ({
  uploaderPage: page,
}) => {
  const detail = makeSurfaceContractDetail();
  await installSurfaceContractDetail({ page: page, detail: detail });
  const calls: Array<{ path: string; body: unknown }> = [];
  await _installMilestoneContract({ page: page, calls: calls });
  await _installAttachmentContract({
    page: page,
    detail: detail,
    calls: calls,
    failFirst: true,
  });
  await page.getByRole("button", { name: "Tick all 12", exact: true }).click();
  await page
    .getByRole("button", { name: "Put under a milestone", exact: true })
    .click();
  await page.getByRole("button", { name: /Create a new milestone/ }).click();
  await page
    .getByRole("textbox", { name: "What happened", exact: true })
    .fill(OCCASION.name);
  await page
    .getByRole("button", { name: "Create it and attach 12", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry attachment", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry attachment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  _expectOneCreationAndTwoAttachments(calls);
  await expect(
    page.getByText(OCCASION.name, { exact: false }).first(),
  ).toBeVisible();
});

test("surface 8 client contract widening changes the occasion span without amending file dates", async ({
  uploaderPage: page,
}) => {
  const detail = makeSurfaceContractDetail();
  _applyStrayCaptureDay(detail);
  await installSurfaceContractDetail({ page: page, detail: detail });
  const calls: Array<{ path: string; body: unknown }> = [];
  await _installMilestoneContract({
    page: page,
    calls: calls,
    onPatch: () => {
      detail.mismatches = [];
    },
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/dates")) {
      calls.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
    }
  });
  await page
    .getByRole("radio", {
      name: "Widen the occasion to cover them",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Widen the occasion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Widen the occasion", exact: true }),
  ).toBeHidden();
  expect(calls).toEqual([
    {
      path: `/api/milestones/${MILESTONE_ID}`,
      body: { startsOn: "2026-09-16", endsOn: "2026-09-17" },
    },
  ]);
  expect(detail.files[0]!.capturedOn).toBe("2026-09-16");
});

test("surface 8 client contract full member and group choices keep empty restrictions invalid and save before commit", async ({
  uploaderPage: page,
}, testInfo) => {
  await pickFilesInUploadSurface({
    page,
    paths: makeUploadSurfaceFixturePaths({
      directory: testInfo.outputPath("visibility"),
      count: 12,
    }),
  });
  await expect(
    page.getByRole("button", { name: "Put 12 up", exact: true }),
  ).toBeEnabled();
  const detail = await readSurfaceSession({ request: page.request });
  await _installDirectoryContract(page);
  const writes: Array<{ path: string; body: unknown }> = [];
  await _installVisibilityWriteContract({ page, detail, writes });
  await page.getByText("Only", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Put 12 up", exact: true }),
  ).toBeDisabled();
  await _pickRestrictedSubjects(page);
  await page.getByRole("button", { name: "Put 12 up", exact: true }).click();
  await expect
    .poll(() => {
      return writes.length;
    })
    .toBe(2);
  expect(writes).toEqual([
    {
      path: "visibility",
      body: {
        mode: "only",
        subjects: [
          { kind: "member", id: MEMBER_ID },
          { kind: "group", id: GROUP_ID },
        ],
      },
    },
    { path: "commit", body: { intent: "arm" } },
  ]);
});

async function _pickRestrictedSubjects(page: Page): Promise<void> {
  const choices = page.getByRole("combobox", {
    name: "Only these",
    exact: true,
  });
  await choices.fill("Abuela");
  await page.getByRole("option", { name: "Abuela Rosa", exact: true }).click();
  await choices.fill("grandparents");
  await page.getByRole("option", { name: /The grandparents/ }).click();
}

async function _installDirectoryContract(page: Page): Promise<void> {
  await page.route("**/api/members", (route) => {
    return route.fulfill({
      json: {
        shape: "directory",
        members: [{ memberId: MEMBER_ID, displayName: "Abuela Rosa" }],
        nextCursor: null,
      },
    });
  });
  await page.route("**/api/groups", (route) => {
    return route.fulfill({
      json: {
        shape: "picker",
        groups: [{ groupId: GROUP_ID, name: "The grandparents" }],
        nextCursor: null,
      },
    });
  });
}

async function _installMilestoneContract({
  page,
  calls,
  onPatch = () => {},
}: Readonly<{
  page: Page;
  calls: Array<{ path: string; body: unknown }>;
  onPatch?: () => void;
}>): Promise<void> {
  await page.route("**/api/milestones**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      await route.fulfill({
        json: { milestones: [MILESTONE_DETAIL], nextCursor: null },
      });
    } else {
      calls.push({ path: url.pathname, body: request.postDataJSON() });
      if (request.method() === "PATCH") {
        onPatch();
      }
      await route.fulfill({
        status: request.method() === "POST" ? 201 : 200,
        json: MILESTONE_DETAIL,
      });
    }
  });
}
type InstallAttachmentContractOptions = {
  page: Page;
  detail: UploadSessionDetail;
  calls: Array<{ path: string; body: unknown }>;
  failFirst: boolean;
};

async function _installAttachmentContract({
  page,
  detail,
  calls,
  failFirst,
}: Readonly<InstallAttachmentContractOptions>): Promise<void> {
  let attachmentAttemptCount = 0;
  await page.route("**/api/upload-sessions/*/edits", async (route) => {
    attachmentAttemptCount += 1;
    calls.push({
      path: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    if (failFirst && attachmentAttemptCount === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { code: "storage_unavailable", message: "Try again" } },
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
      targetCount: 12,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    detail.edits = [edit];
    detail.days[0]!.milestones = [OCCASION];
    await route.fulfill({ status: 201, json: edit });
  });
}

function _expectOneCreationAndTwoAttachments(
  calls: ReadonlyArray<{ path: string; body: unknown }>,
): void {
  expect(
    calls.filter((call) => {
      return call.path === "/api/milestones";
    }),
  ).toEqual([
    {
      path: "/api/milestones",
      body: {
        name: OCCASION.name,
        startsOn: "2026-09-17",
        endsOn: "2026-09-17",
        blurb: null,
      },
    },
  ]);
  const attachments = calls.filter((call) => {
    return call.path.endsWith("/edits");
  });
  expect(attachments).toHaveLength(2);
  expect(
    attachments.map((call) => {
      return (call.body as CreateUploadEditRequest).milestoneId;
    }),
  ).toEqual([MILESTONE_ID, MILESTONE_ID]);
}

function _applyStrayCaptureDay(detail: UploadSessionDetail): void {
  detail.files[0]!.capturedOn = "2026-09-16";
  detail.mismatches = [
    {
      milestone: OCCASION,
      files: [
        {
          fileId: detail.files[0]!.fileId,
          originalFilename: detail.files[0]!.originalFilename,
          capturedOn: "2026-09-16",
        },
      ],
    },
  ];
}

async function _installVisibilityWriteContract(
  options: Readonly<{
    page: Page;
    detail: UploadSessionDetail;
    writes: Array<{ path: string; body: unknown }>;
  }>,
): Promise<void> {
  const { page, detail, writes } = options;
  await page.route("**/api/upload-sessions/*/visibility", async (route) => {
    const body = route.request().postDataJSON() as {
      mode: "only";
      subjects: Array<{ kind: "member" | "group"; id: string }>;
    };
    writes.push({ path: "visibility", body });
    await route.fulfill({
      json: {
        visibilityRuleId: "restriction",
        mode: body.mode,
        label: "Abuela Rosa and The grandparents",
        subjects: body.subjects.map((subject) => {
          return {
            ...subject,
            displayName:
              subject.kind === "member" ? "Abuela Rosa" : "The grandparents",
          };
        }),
      },
    });
  });
  await page.route("**/api/upload-sessions/*/commit", async (route) => {
    writes.push({ path: "commit", body: route.request().postDataJSON() });
    await route.fulfill({ json: { ...detail, state: "uploading" } });
  });
  await page.route("**/api/upload-sessions/*/files/*/presign", () => {});
}
