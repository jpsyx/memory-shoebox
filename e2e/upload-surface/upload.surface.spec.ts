import { expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { E2E_DATABASE_PATH } from "../support/e2eEnvironment.constants.ts";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import {
  readFakeS3Requests,
  readUploadedFiles,
} from "../support/uploadCatalogHelpers.ts";
import { expectOneEmailPerRecipient } from "../support/uploadExpectations/uploadTransferExpectationHelpers.ts";
import {
  REFUSED_FIXTURE_NAME,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../support/uploadHarnessHelpers.ts";
import {
  addSurfaceLabel,
  pickFilesInUploadSurface,
  readSurfaceSession,
  test,
} from "./uploadSurfaceTestHelpers.ts";

test("surface 8 sends 264 distinct mixed files independently of ticks and queues one notification", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(600_000);
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("mixed"),
    count: 264,
  });
  await pickFilesInUploadSurface({
    page,
    paths: [...paths, join(UPLOAD_FIXTURE_DIRECTORY, REFUSED_FIXTURE_NAME)],
  });
  await expect(
    page.getByRole("button", { name: "Put 264 up", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  const before = await readSurfaceSession({ request: page.request });
  expect(before.files).toHaveLength(265);
  await expect(
    page
      .getByRole("region", { name: "What is going up", exact: true })
      .getByText("265", { exact: true }),
  ).toBeVisible();
  await _applyMixedBatchLabels(page);
  const { reads, visibilityWrites } = _observeMixedBatchRequests({
    page,
    sessionId: before.sessionId,
  });
  await page.getByRole("button", { name: "Put 264 up", exact: true }).click();
  await expect(page.getByRole("heading", { name: /264.*up/ })).toBeVisible({
    timeout: 540_000,
  });
  expect(reads).toHaveLength(1);
  expect(visibilityWrites).toEqual([]);
  await _expectMixedBatch(before.sessionId);
  await expectOneEmailPerRecipient(before.sessionId);
});

async function _expectMixedBatch(sessionId: string): Promise<void> {
  const files = await readUploadedFiles(sessionId);
  const accepted = files.filter((file) => {
    return file.state === "done";
  });
  expect(accepted).toHaveLength(264);
  const expectedDates = [
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
    "2026-05-04",
    "2026-05-05",
  ];
  accepted.forEach((file, index) => {
    expect(file.item?.capturedOn, file.originalFilename).toBe(
      expectedDates[index % 5],
    );
    expect(file.item?.tagNames).toContain("surface batch");
  });
  const refused = files.find((file) => {
    return file.originalFilename === REFUSED_FIXTURE_NAME;
  })!;
  expect(refused).toMatchObject({
    state: "refused",
    problemCode: "unsupported_type",
    attemptCount: 0,
  });
  expect(
    (await readFakeS3Requests()).filter((request) => {
      return request.key.includes(refused.fileId);
    }),
  ).toEqual([]);
  await _expectMixedBatchPeople(
    accepted.map((file) => {
      return file.item!.itemId;
    }),
  );
}

test("surface 8 keeps the active engine alive while navigating the actual router", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(120_000);
  const directory = testInfo.outputPath("navigation");
  const paths = makeUploadSurfaceFixturePaths({ directory, count: 8 });
  await pickFilesInUploadSurface({ page, paths });
  await expect(
    page.getByRole("button", { name: "Put 8 up", exact: true }),
  ).toBeEnabled();
  const detail = await readSurfaceSession({ request: page.request });
  let release: () => void = () => {};
  const held = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  await page.route(
    "**/api/upload-sessions/*/files/*/complete",
    async (route) => {
      await held;
      await route.continue();
    },
  );
  const completing = page.waitForRequest(
    "**/api/upload-sessions/*/files/*/complete",
  );
  await page.getByRole("button", { name: "Put 8 up", exact: true }).click();
  await completing;
  await page.getByRole("link", { name: "Back to the pile" }).click();
  await expect(page).toHaveURL(/\/$/);
  release();
  await expect
    .poll(
      async () => {
        return (await readUploadedFiles(detail.sessionId)).filter((file) => {
          return file.state === "done";
        }).length;
      },
      { timeout: 90_000 },
    )
    .toBe(8);
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /8 up, across/ }),
  ).toBeVisible();
});

async function _applyMixedBatchLabels(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Tick all 53", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Tick everything", exact: true })
    .click();
  await addSurfaceLabel({
    page,
    kind: "tag",
    name: "surface batch",
    count: 264,
  });
  await page
    .getByRole("button", { name: "Tick all 53", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Tick everything", exact: true })
    .click();
  await addSurfaceLabel({
    page,
    kind: "person",
    name: "Surface Cousin",
    count: 264,
  });
  await expect(
    page.getByRole("button", { name: "Untick", exact: true }),
  ).toBeHidden();
}

function _observeMixedBatchRequests(
  options: Readonly<{ page: Page; sessionId: string }>,
): { reads: string[]; visibilityWrites: string[] } {
  const { page, sessionId } = options;
  const reads: string[] = [];
  const visibilityWrites: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === `/api/upload-sessions/${sessionId}`
    ) {
      reads.push(request.url());
    }
    if (new URL(request.url()).pathname.endsWith("/visibility")) {
      visibilityWrites.push(request.url());
    }
  });
  return { reads, visibilityWrites };
}

async function _expectMixedBatchPeople(
  itemIds: readonly string[],
): Promise<void> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    const people = await database
      .selectFrom("item_people")
      .innerJoin("people", "people.id", "item_people.person_id")
      .select("item_people.item_id")
      .where("people.display_name", "=", "Surface Cousin")
      .where("item_people.item_id", "in", itemIds)
      .execute();
    expect(people).toHaveLength(264);
  } finally {
    await database.destroy();
  }
}
