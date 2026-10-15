import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { expect, type Page, type Route } from "@playwright/test";
import { join } from "node:path";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import { signInAs } from "../support/signIn.ts";
import {
  readFakeS3Requests,
  readUploadedFiles,
  readUploadSessionEmailAddresses,
} from "../support/uploadCatalogHelpers.ts";
import {
  REFUSED_FIXTURE_NAME,
  UPLOAD_FIXTURE_DIRECTORY,
  UPLOADER_EMAIL,
} from "../support/uploadHarnessHelpers.ts";
import {
  addSurfaceLabel,
  pickFilesInUploadSurface,
  getSurfaceSessionFromRequest,
  test,
} from "./uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";

test("surface 8 tab close preserves edits and the complete missing list, and never resends landed files", async ({
  uploaderPage: page,
  uploaderContext,
}, testInfo) => {
  test.setTimeout(180_000);
  const storageCapability = await _getNativeOriginalStorageCapability(page);
  await testInfo.attach("native-original-storage-capability", {
    body: JSON.stringify({
      browserVersion: page.context().browser()!.version(),
      ...storageCapability,
    }),
    contentType: "application/json",
  });
  const { detail, paths } = await _prepareLabelledBatch({
    page,
    directory: testInfo.outputPath("resume"),
    fileCount: 18,
    name: "tab survived",
  });
  const gate = await _holdAfterTwoCompletions(page);
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
  const beforeClose = await _getStoredOriginalEvidence(page);
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
    )
      landedTransferReads.push(request.url());
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
  await _expectCompleteMissingList(reopened);
  const afterReopen = await _getStoredOriginalEvidence(reopened);
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
  for (const file of landed) {
    const preview = reopened.getByRole("img", {
      name: file.originalFilename,
      exact: true,
    });
    await expect(preview).toHaveCount(1);
    await preview.scrollIntoViewIfNeeded();
    await expect
      .poll(() => {
        return preview.evaluate((image: HTMLImageElement) => {
          return image.complete && image.naturalWidth > 0;
        });
      })
      .toBe(true);
    expect(
      decodeURIComponent((await preview.getAttribute("src")) ?? ""),
    ).toContain(file.fileId);
  }
  const hydratedLog = await readFakeS3Requests();
  const reopeningLanded = hydratedLog
    .slice(reopenLogOffset)
    .filter((request) => {
      return landed.some((file) => {
        return request.key.includes(file.fileId);
      });
    });
  expect(
    reopeningLanded.every((request) => {
      return request.method === "GET" && request.operation === "GetObject";
    }),
  ).toBe(true);
  const logLength = hydratedLog.length;
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
  await _expectResumedCatalogAndStorage({
    sessionId: detail.sessionId,
    logLength,
    landedIds: landed.map((file) => {
      return file.fileId;
    }),
  });
});

/** Independent native capability, established before any upload or recovery UI. */
async function _getNativeOriginalStorageCapability(page: Page): Promise<{
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
        if (!(error instanceof Error)) throw error;
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

async function _getStoredOriginalEvidence(page: Page): Promise<unknown> {
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

async function _holdAfterTwoCompletions(
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

test("surface 8 failed and refused rows differ, and a settled retry leaves the notification outbox unchanged", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const detail = await _prepareFailedOriginal({
    page,
    directory: testInfo.outputPath("failure"),
  });
  const failedId = detail.files[0]!.fileId;
  await page.getByRole("button", { name: "Put 3 up", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2 up. Some did not." }),
  ).toBeVisible({ timeout: 120_000 });
  await _expectFailedAndRefused({ sessionId: detail.sessionId, failedId });
  const retry = page.getByRole("button", {
    name: "Retry portrait-orientation-6-0.jpg",
    exact: true,
  });
  await expect(retry).toHaveCount(1);
  const addresses = await readUploadSessionEmailAddresses(detail.sessionId);
  await page.unroute("**/uploads/**");
  await retry.click();
  await expect(
    page.getByRole("heading", { name: "3 up. Some did not." }),
  ).toBeVisible({ timeout: 90_000 });
  expect(
    (await readUploadedFiles(detail.sessionId)).filter((file) => {
      return file.state === "done";
    }),
  ).toHaveLength(3);
  expect(await readUploadSessionEmailAddresses(detail.sessionId)).toEqual(
    addresses,
  );
  await expect(
    page
      .getByText(
        "This photograph will appear on its day without another email.",
      )
      .first(),
  ).toBeVisible();
});

test("surface 8 an expired browser signs in again with its unstarted draft discarded", async ({
  uploaderPage: page,
  uploaderContext,
  browserName,
}, testInfo) => {
  test.setTimeout(90_000);
  const { detail } = await _prepareLabelledBatch({
    page,
    directory: testInfo.outputPath("auth"),
    fileCount: 1,
    name: "addressed plan",
  });
  await uploaderContext.clearCookies();
  await page.goto(`/upload?session=${detail.sessionId}`);
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  if (browserName === "webkit") {
    await _installWebKitSignInCookie(page);
  }
  await signInAs({ page, email: UPLOADER_EMAIL });
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByText("addressed plan", { exact: false })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByText("addressed plan", { exact: false })).toHaveCount(
    0,
  );
  const current = await page.request.get("/api/upload-sessions/current");
  expect(current.status()).toBe(204);
  const discarded = await page.request.get(
    `/api/upload-sessions/${detail.sessionId}`,
  );
  expect((await discarded.json()).state).toBe("cancelled");
});

test("surface 8 completion network loss never claims an unconfirmed original is up", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("unconfirmed"),
    fileCount: 1,
  });
  await pickFilesInUploadSurface({ page, paths });
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  const detail = await getSurfaceSessionFromRequest({ request: page.request });
  let completionRequests = 0;
  await page.route(
    "**/api/upload-sessions/*/files/*/complete",
    async (route) => {
      completionRequests += 1;
      await route.abort("connectionfailed");
    },
  );
  await page.getByRole("button", { name: "Put 1 up", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "What did not arrive", exact: true })
      .getByText("Not confirmed up", { exact: true }),
  ).toBeVisible({ timeout: 100_000 });
  await expect(
    page.getByRole("heading", { name: "You were in the middle of this." }),
  ).toBeVisible();
  expect(completionRequests).toBeGreaterThan(1);
  expect((await readUploadedFiles(detail.sessionId))[0]!.state).toBe("sending");
  expect(await readUploadSessionEmailAddresses(detail.sessionId)).toEqual([]);
  await expect(
    page.getByRole("heading", { name: /1 up, across/ }),
  ).toBeHidden();
  await page.unroute("**/api/upload-sessions/*/files/*/complete");
  await page
    .getByRole("button", { name: "Resume upload", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /1 up, across/ })).toBeVisible(
    { timeout: 90_000 },
  );
  expect((await readUploadedFiles(detail.sessionId))[0]!.state).toBe("done");
});

async function _expectCompleteMissingList(page: Page): Promise<void> {
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

async function _prepareFailedOriginal(
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
type PrepareLabelledBatchOptions = {
  page: Page;
  directory: string;
  fileCount: number;
  name: string;
};

async function _prepareLabelledBatch(
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

async function _expectResumedCatalogAndStorage(
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

async function _expectFailedAndRefused(
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

async function _installWebKitSignInCookie(page: Page): Promise<void> {
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
