import { makeSurfaceMatrixDetailFromState } from "../../uploadSurfaceTestHelpers/makeSurfaceMatrixDetailFromState.ts";

import { expect } from "@playwright/test";

import { test } from "../../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";

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
