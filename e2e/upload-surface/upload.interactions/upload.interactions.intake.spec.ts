import { expect } from "@playwright/test";

import {
  expectSurfaceContrast,
  expectSurfaceControlsUnclipped,
} from "../uploadSurfaceLayoutHelpers.ts";

import {
  installSurfaceContractDetail,
  test,
} from "../uploadSurfaceTestHelpers/uploadSurfaceTestHelpers.ts";
import {
  expectIncomingColor,
  makeDistinctImages,
  makePairDetail,
} from "./uploadinteractionsTestHelpers.ts";

(["tag", "person"] as const).forEach((kind) => {
  test(`surface 8 immediate ${kind} typing and insertion keep one whole token`, async ({
    uploaderPage: page,
  }) => {
    await installSurfaceContractDetail({ page, detail: makePairDetail() });
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

(["light", "dark"] as const).forEach((scheme) => {
  test(`surface 8 ${scheme} mobile equal-name equal-size originals expose identity and safe skip`, async ({
    uploaderPage: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const buffers = await makeDistinctImages(page);
    expect(buffers[0]!.equals(buffers[1]!)).toBe(false);
    expect(buffers[0]!.length).toBe(buffers[1]!.length);
    const detail = makePairDetail();
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
    await expectIncomingColor({ page, channel: 0 });
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
    await expectIncomingColor({ page, channel: 2 });
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
