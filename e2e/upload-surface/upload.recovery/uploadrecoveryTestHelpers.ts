import type { UploadSessionDetail } from "@memory-shoebox/shared";

import { expect, type Page, type Route } from "@playwright/test";

import { join } from "node:path";

import { makeUploadSurfaceFixturePaths } from "../../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";

import {
  readFakeS3Requests,
  readUploadedFiles,
} from "../../support/uploadCatalogHelpers.ts";

import {
  REFUSED_FIXTURE_NAME,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../../support/uploadHarnessHelpers.ts";

import {
  addSurfaceLabel,
  getSurfaceSessionFromRequest,
  pickFilesInUploadSurface,
} from "../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";
/** Shared scenario fixture. */
export async function getNativeOriginalStorageCapability(page: Page): Promise<{
  canStoreOriginalBlob: boolean;
  failure?: { name: string; message: string };
}> {
  return page.evaluate(async () => {
    const name = `task18-native-originals-${crypto.randomUUID()}`;
    const database = await new Promise<IDBDatabase>((fulfill, reject) => {
      const opening = indexedDB.open(name, 1);
      const timer = setTimeout(() => {
        return reject(new Error("Native storage probe open timed out"));
      }, 10000);
      opening.onupgradeneeded = () => {
        return opening.result.createObjectStore("probe");
      };
      opening.onsuccess = () => {
        clearTimeout(timer);
        fulfill(opening.result);
      };
      opening.onerror = () => {
        clearTimeout(timer);
        reject(opening.error);
      };
    });
    const commit = (value: string | Blob): Promise<void> => {
      return new Promise((fulfill, reject) => {
        const transaction = database.transaction("probe", "readwrite");
        const timer = setTimeout(() => {
          return transaction.abort();
        }, 10000);
        transaction.oncomplete = () => {
          clearTimeout(timer);
          fulfill();
        };
        transaction.onabort = () => {
          clearTimeout(timer);
          reject(
            transaction.error ?? new Error("Native storage probe aborted"),
          );
        };
        try {
          transaction.objectStore("probe").put(value, "control");
        } catch (error) {
          clearTimeout(timer);
          transaction.abort();
          reject(error);
        }
      });
    };
    try {
      await commit("owned native storage control");
      try {
        // Production saves file.slice(), which is a Blob, in its original record.
        await commit(new File(["owned native original"], "probe.bin").slice());
        return { canStoreOriginalBlob: true };
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        return {
          canStoreOriginalBlob: false,
          failure: { name: error.name, message: error.message },
        };
      }
    } finally {
      database.close();
      await new Promise<void>((fulfill, reject) => {
        const deletion = indexedDB.deleteDatabase(name);
        const timer = setTimeout(() => {
          return reject(new Error("Native storage probe cleanup timed out"));
        }, 10000);
        deletion.onsuccess = () => {
          clearTimeout(timer);
          fulfill();
        };
        deletion.onerror = () => {
          clearTimeout(timer);
          reject(deletion.error);
        };
        deletion.onblocked = () => {
          clearTimeout(timer);
          reject(new Error("Native storage probe cleanup blocked"));
        };
      });
    }
  });
}
/** Shared scenario fixture. */
export async function getStoredOriginalEvidence(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
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
      return await new Promise((fulfill, reject) => {
        const reading = database
          .transaction("originals")
          .objectStore("originals")
          .getAll();
        reading.onsuccess = () => {
          return fulfill(
            reading.result.map((record) => {
              return {
                sessionId: record.sessionId,
                fileId: record.fileId,
                size: record.blob?.size,
                isBlob: record.blob instanceof Blob,
                savedAt: record.savedAt,
              };
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
  });
}
/** Shared scenario fixture. */
export async function holdAfterTwoCompletions(
  page: Page,
): Promise<{ held: Promise<Route> }> {
  let completionRequestCount = 0;
  let onHeld: (route: Route) => void = () => {};
  const held = new Promise<Route>((resolvePromise) => {
    onHeld = resolvePromise;
  });
  await page.route(
    "**/api/upload-sessions/*/files/*/complete",
    async (route) => {
      completionRequestCount += 1;
      if (completionRequestCount <= 2) {
        await route.continue();
      } else if (completionRequestCount === 3) {
        onHeld(route);
      } else {
        await route.abort();
      }
    },
  );
  return { held };
}
/** Shared scenario fixture. */
export async function expectCompleteMissingList(page: Page): Promise<void> {
  const missing = (
    await getSurfaceSessionFromRequest({ request: page.request })
  ).files.filter((file) => {
    return file.state !== "done";
  });
  expect(missing).toHaveLength(16);
  await Promise.all(
    missing.map((file) => {
      return expect(
        page
          .getByRole("region", { name: "What did not arrive", exact: true })
          .getByText(file.originalFilename, { exact: true }),
      ).toBeVisible();
    }),
  );
}
/** Shared scenario fixture. */
export async function prepareFailedOriginal(
  options: Readonly<{ page: Page; directory: string }>,
): Promise<UploadSessionDetail> {
  const { page, directory } = options;
  const paths = makeUploadSurfaceFixturePaths({
    directory: directory,
    fileCount: 3,
  });
  await pickFilesInUploadSurface({
    page,
    paths: [...paths, join(UPLOAD_FIXTURE_DIRECTORY, REFUSED_FIXTURE_NAME)],
  });
  await expect(
    page.getByRole("button", { name: "Put 3 up", exact: true }),
  ).toBeEnabled();
  const detail = await getSurfaceSessionFromRequest({ request: page.request });
  const failedId = detail.files[0]!.fileId;
  await page.route("**/uploads/**", async (route) => {
    if (
      route.request().method() === "PUT" &&
      route.request().url().includes(failedId) &&
      new URL(route.request().url()).port === "9099"
    ) {
      await route.abort("connectionfailed");
    } else {
      await route.continue();
    }
  });
  return detail;
}
/** Shared scenario fixture. */
export type PrepareLabelledBatchOptions = {
  page: Page;
  directory: string;
  fileCount: number;
  name: string;
};
/** Shared scenario fixture. */
export async function prepareLabelledBatch(
  options: Readonly<PrepareLabelledBatchOptions>,
): Promise<{ paths: string[]; detail: UploadSessionDetail }> {
  const { page, directory, fileCount, name } = options;
  const paths = makeUploadSurfaceFixturePaths({ directory, fileCount });
  await pickFilesInUploadSurface({ page, paths });
  await expect(
    page.getByRole("button", { name: `Put ${fileCount} up`, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: `Tick all ${Math.ceil(fileCount / 5)}`,
      exact: true,
    })
    .first()
    .click();
  if (fileCount > 1) {
    await page
      .getByRole("button", { name: "Tick everything", exact: true })
      .click();
  }
  await addSurfaceLabel({
    page,
    kind: "tag",
    name,
    selectedFileCount: fileCount,
  });
  return {
    paths,
    detail: await getSurfaceSessionFromRequest({ request: page.request }),
  };
}
/** Shared scenario fixture. */
export async function expectResumedCatalogAndStorage(
  options: Readonly<{
    sessionId: string;
    logLength: number;
    landedIds: readonly string[];
  }>,
): Promise<void> {
  const { sessionId, logLength, landedIds } = options;
  const resumedLog = (await readFakeS3Requests()).slice(logLength);
  expect(
    resumedLog.filter((request) => {
      return landedIds.some((fileId) => {
        return request.key.includes(fileId);
      });
    }),
  ).toEqual([]);
  expect(
    (await readUploadedFiles(sessionId)).every((file) => {
      return file.item?.tagNames.includes("tab survived");
    }),
  ).toBe(true);
}
/** Shared scenario fixture. */
export async function expectFailedAndRefused(
  options: Readonly<{ sessionId: string; failedId: string }>,
): Promise<void> {
  const { sessionId, failedId } = options;
  const files = await readUploadedFiles(sessionId);
  expect(
    files.find((file) => {
      return file.fileId === failedId;
    })?.state,
  ).toBe("failed");
  expect(
    files.find((file) => {
      return file.originalFilename === REFUSED_FIXTURE_NAME;
    })?.state,
  ).toBe("refused");
}
/** Shared scenario fixture. */
export async function installWebKitSignInCookie(page: Page): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    const state = await page.request.storageState();
    await page.context().addCookies(
      state.cookies.map((cookie) => {
        return { ...cookie, secure: false };
      }),
    );
    const headers = response.headers();
    const cookie = headers["set-cookie"];
    await route.fulfill({
      response,
      headers: {
        ...headers,
        ...(cookie ? { "set-cookie": cookie.replace(/; Secure/gi, "") } : {}),
      },
    });
  });
}
