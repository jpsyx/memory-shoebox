import { waitForUploadResumeMedia } from "../../../support/waitForUploadResumeMedia.ts";

import { expect } from "@playwright/test";

import {
  readFakeS3Requests,
  readUploadedFiles,
} from "../../../support/uploadCatalogHelpers.ts";

import {
  getSurfaceSessionFromRequest,
  pickFilesInUploadSurface,
  test,
} from "../../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";
import {
  expectCompleteMissingList,
  expectResumedCatalogAndStorage,
  getNativeOriginalStorageCapability,
  getStoredOriginalEvidenceFromPage,
  holdAfterTwoCompletions,
  prepareLabelledBatch,
} from "./uploadrecoveryTestHelpers.ts";

test("surface 8 tab close preserves edits and the complete missing list, and never resends landed files", async ({
  uploaderPage: page,
  uploaderContext,
}, testInfo) => {
  test.setTimeout(180_000);
  const storageCapability = await getNativeOriginalStorageCapability(page);
  await testInfo.attach("native-original-storage-capability", {
    body: JSON.stringify({
      browserVersion: page.context().browser()!.version(),
      ...storageCapability,
    }),
    contentType: "application/json",
  });
  const { detail, paths } = await prepareLabelledBatch({
    page,
    directory: testInfo.outputPath("resume"),
    fileCount: 18,
    name: "tab survived",
  });
  const gate = await holdAfterTwoCompletions(page);
  await page.getByRole("button", { name: "Put 18 up", exact: true }).click();
  const held = await gate.held;
  await expect
    .poll(async () => {
      return (await readUploadedFiles(detail.sessionId)).filter((file) => {
        return file.state === "done";
      }).length;
    })
    .toBe(2);
  const landed = (await readUploadedFiles(detail.sessionId)).filter((file) => {
    return file.state === "done";
  });
  expect(landed).toHaveLength(2);
  const beforeClose = await getStoredOriginalEvidenceFromPage(page);
  await testInfo.attach("original-storage-before-close", {
    body: JSON.stringify(beforeClose),
    contentType: "application/json",
  });
  if (!storageCapability.canStoreOriginalBlob) {
    expect(beforeClose).toEqual([]);
    await expect(
      page.getByText(/This browser could not save all the originals/),
    ).toBeVisible();
  }
  await held.abort();
  await page.close();
  const reopenLogOffset = (await readFakeS3Requests()).length;
  const reopened = await uploaderContext.newPage();
  const landedTransferReads: string[] = [];
  reopened.on("request", (request) => {
    if (
      landed.some((file) => {
        return request.url().includes(file.fileId);
      }) &&
      /\/(presign|complete)(?:\?|$)/.test(request.url())
    ) {
      landedTransferReads.push(request.url());
    }
  });
  await reopened.goto("/upload");
  await expect(
    reopened.getByRole("heading", { name: "You were in the middle of this." }),
  ).toBeVisible();
  await expect(
    reopened.getByText("tab survived", { exact: false }),
  ).toBeVisible();
  await expect(
    reopened.getByText(/Who can see these: Everyone\./),
  ).toBeVisible();
  await expectCompleteMissingList(reopened);
  const afterReopen = await getStoredOriginalEvidenceFromPage(reopened);
  await testInfo.attach("original-storage-after-reopen", {
    body: JSON.stringify(afterReopen),
    contentType: "application/json",
  });
  if (!storageCapability.canStoreOriginalBlob) {
    expect(afterReopen).toEqual([]);
    await expect(
      reopened.getByText("16 originals need to be chosen again.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      reopened.getByRole("button", {
        name: "Choose files to resume",
        exact: true,
      }),
    ).toBeEnabled();
  } else {
    await expect(
      reopened.getByRole("button", { name: "Resume upload", exact: true }),
    ).toBeEnabled();
    const storedIds = await reopened.evaluate(async (sessionId) => {
      const database = await new Promise<IDBDatabase>((fulfill, reject) => {
        const opening = indexedDB.open("memory-shoebox-upload-originals", 1);
        opening.onsuccess = () => {
          return fulfill(opening.result);
        };
        opening.onerror = () => {
          return reject(opening.error);
        };
      });
      try {
        return await new Promise<string[]>((fulfill, reject) => {
          const reading = database
            .transaction("originals")
            .objectStore("originals")
            .getAll();
          reading.onsuccess = () => {
            return fulfill(
              reading.result
                .filter((record: { sessionId: string }) => {
                  return record.sessionId === sessionId;
                })
                .map((record: { fileId: string }) => {
                  return record.fileId;
                }),
            );
          };
          reading.onerror = () => {
            return reject(reading.error);
          };
        });
      } finally {
        database.close();
      }
    }, detail.sessionId);
    expect(storedIds.sort()).toEqual(
      detail.files
        .filter((file) => {
          return !landed.some((done) => {
            return done.fileId === file.fileId;
          });
        })
        .map((file) => {
          return file.fileId;
        })
        .sort(),
    );
    await testInfo.attach("persisted-original-identities", {
      body: JSON.stringify(storedIds),
      contentType: "application/json",
    });
  }
  const current = await getSurfaceSessionFromRequest({
    request: reopened.request,
    sessionId: detail.sessionId,
  });
  const logLength = await waitForUploadResumeMedia({
    page: reopened,
    reopenLogOffset,
    readRequests: readFakeS3Requests,
    landed: landed.map((file) => {
      const source = current.files.find((candidate) => {
        return candidate.fileId === file.fileId;
      })?.media?.thumb?.url;
      expect(source).toBeDefined();
      return { ...file, source: source! };
    }),
  });
  if (!storageCapability.canStoreOriginalBlob) {
    await pickFilesInUploadSurface({ page: reopened, paths });
  } else {
    await reopened
      .getByRole("button", { name: "Resume upload", exact: true })
      .click();
  }
  await expect(
    reopened.getByRole("heading", { name: /18 up, across/ }),
  ).toBeVisible({ timeout: 120_000 });
  expect(landedTransferReads).toEqual([]);
  for (const file of landed) {
    expect(
      (await readFakeS3Requests()).filter((request) => {
        return (
          request.key.includes(`${file.fileId}/original.`) &&
          request.operation === "PutObject" &&
          request.status === 200
        );
      }),
    ).toHaveLength(1);
  }
  await expectResumedCatalogAndStorage({
    sessionId: detail.sessionId,
    logLength,
    landedIds: landed.map((file) => {
      return file.fileId;
    }),
  });
});
