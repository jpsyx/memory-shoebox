import type { Page } from "@playwright/test";
import { fileURLToPath as fileUrlToPath } from "node:url";
import { test, expect, signIn } from "./support/commentTaggingFixtures.ts";

const PHOTO = fileUrlToPath(
  new URL("../fixtures/upload/portrait-orientation-6.jpg", import.meta.url),
);

test("EXIF photo keyboard crop saves a private image, cancels cleanly and removes to initials", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto("/account");
  await page.getByLabel("Choose photo file").setInputFiles(PHOTO);
  const dialog = page.getByRole("dialog", { name: "Adjust your photo" });
  await expect(dialog).toBeVisible();
  const slider = dialog.getByRole("slider", { name: "Photo zoom" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "1.1");
  await dialog
    .getByRole("button", { name: "Zoom in", exact: true })
    .press("Enter");
  await expect
    .poll(async () => {
      return Number(await slider.getAttribute("aria-valuenow"));
    })
    .toBeCloseTo(1.2, 8);
  await dialog
    .getByRole("button", { name: "Zoom out", exact: true })
    .press("Enter");
  await expect(slider).toHaveAttribute("aria-valuenow", "1.1");
  const preview = dialog.getByLabel("Photo crop preview").locator("img");
  const initialPosition = await preview.getAttribute("style");
  await dialog
    .getByRole("button", { name: "Move photo left", exact: true })
    .press("Enter");
  await dialog
    .getByRole("button", { name: "Move photo up", exact: true })
    .press("Enter");
  const movedPosition = await preview.getAttribute("style");
  expect(movedPosition).not.toBe(initialPosition);
  await dialog
    .getByRole("button", { name: "Move photo right", exact: true })
    .press("Enter");
  await expect(preview).not.toHaveAttribute("style", movedPosition!);
  const rightPosition = await preview.getAttribute("style");
  await dialog
    .getByRole("button", { name: "Move photo down", exact: true })
    .press("Enter");
  await expect(preview).not.toHaveAttribute("style", rightPosition!);
  await expect(preview).toHaveAttribute("style", initialPosition!);
  await dialog
    .getByRole("button", { name: "Reset", exact: true })
    .press("Enter");
  await expect(slider).toHaveAttribute("aria-valuenow", "1");
  await slider.focus();
  await slider.press("ArrowRight");
  const expected = await _getPixelsFromCropPreview(page);
  const reservation = page.waitForRequest((request) => {
    return (
      request.url().endsWith("/api/me/avatar-uploads") &&
      request.method() === "POST"
    );
  });
  await dialog
    .getByRole("button", { name: "Save photo", exact: true })
    .press("Enter");
  expect((await reservation).postDataJSON().crop.zoom).toBe(1.1);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change photo" }),
  ).toBeFocused();
  const avatar = await page.request.get(
    `${catalog.origin}/api/members/${catalog.members.Ana.memberId}/avatar`,
  );
  const metadata = (await avatar.json()).avatar;
  expect(metadata.url).toContain(catalog.endpoint);
  await _expectSavedImageMatchesPreview({ page, url: metadata.url, expected });
  const image = await page.request.get(metadata.url);
  expect(image.headers()["content-type"]).toBe("image/webp");
  await page.getByLabel("Choose photo file").setInputFiles(PHOTO);
  await dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Change photo" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep photo" })).toBeFocused();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove photo", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Add a photo" })).toBeVisible();
  expect(
    (
      await (
        await page.request.get(
          `${catalog.origin}/api/members/${catalog.members.Ana.memberId}/avatar`,
        )
      ).json()
    ).avatar,
  ).toBeNull();
});

test("another-window avatar conflict offers latest without overwriting, then replacement uses current version", async ({
  page,
  browser,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto("/account");
  await page.getByLabel("Choose photo file").setInputFiles(PHOTO);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await signIn(otherPage, catalog);
    await otherPage.goto(`${catalog.origin}/account`);
    await otherPage.getByLabel("Choose photo file").setInputFiles(PHOTO);
    await otherPage
      .getByRole("button", { name: "Save photo", exact: true })
      .click();
    await expect(
      otherPage.getByRole("button", { name: "Change photo" }),
    ).toBeVisible();
    const current = (
      await catalog.database
        .selectFrom("members")
        .select("avatar_id")
        .where("id", "=", catalog.members.Ana.memberId)
        .executeTakeFirstOrThrow()
    ).avatar_id;
    await page.getByRole("button", { name: "Save photo", exact: true }).click();
    await expect(
      page.getByText("Your photo changed in another window."),
    ).toBeVisible();
    expect(
      (
        await catalog.database
          .selectFrom("members")
          .select("avatar_id")
          .where("id", "=", catalog.members.Ana.memberId)
          .executeTakeFirstOrThrow()
      ).avatar_id,
    ).toBe(current);
    await page.getByRole("button", { name: "Save this photo instead" }).click();
    await expect(
      page.getByRole("dialog", { name: "Adjust your photo" }),
    ).toHaveCount(0);
    expect(
      (
        await catalog.database
          .selectFrom("members")
          .select("avatar_id")
          .where("id", "=", catalog.members.Ana.memberId)
          .executeTakeFirstOrThrow()
      ).avatar_id,
    ).not.toBe(current);
  } finally {
    await other.close();
  }
});

test("odd-dimension fractional crop preview agrees with the actual saved image", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto("/account");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 501;
    canvas.height = 303;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 501, 303);
    gradient.addColorStop(0, "#e7483d");
    gradient.addColorStop(0.5, "#24bb88");
    gradient.addColorStop(1, "#334ecc");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 501, 303);
    context.fillStyle = "#ffffff";
    context.fillRect(170, 70, 70, 70);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  await page.getByLabel("Choose photo file").setInputFiles({
    name: "odd.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  const dialog = page.getByRole("dialog", { name: "Adjust your photo" });
  const zoom = dialog.getByRole("slider", { name: "Photo zoom" });
  await zoom.focus();
  await zoom.press("ArrowRight");
  await zoom.press("ArrowRight");
  await zoom.press("ArrowRight");
  await dialog
    .getByRole("button", { name: "Move photo left", exact: true })
    .click();
  const expected = await _getPixelsFromCropPreview(page);
  await dialog.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const { avatar } = await (
    await page.request.get(
      `${catalog.origin}/api/members/${catalog.members.Ana.memberId}/avatar`,
    )
  ).json();
  await _expectSavedImageMatchesPreview({ page, url: avatar.url, expected });
});

test("sign-out during pending avatar response cannot publish into the next account", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto("/account");
  const responseReady = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/me/avatar-uploads/*", async (route) => {
    const response = await route.fetch();
    responseReady.resolve();
    await release.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel("Choose photo file").setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await responseReady.promise;
  expect(
    (await page.request.delete(`${catalog.origin}/api/auth/session`)).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Your email" })).toBeVisible();
  release.resolve();
  await signIn(page, catalog, "Jorge");
  await page.goto("/account");
  await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue(
    "Jorge",
  );
  await expect(page.getByRole("button", { name: "Add a photo" })).toBeVisible();
  expect(
    (await (await page.request.get(`${catalog.origin}/api/me`)).json()).me
      .member.avatar,
  ).toBeNull();
});

async function _getPixelsFromCropPreview(page: Page): Promise<number[]> {
  return page.getByLabel("Photo crop preview").evaluate((element) => {
    const image = element.querySelector("img")!;
    const bounds = element.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    const scale = imageBounds.width / image.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.drawImage(
      image,
      (bounds.left - imageBounds.left) / scale,
      (bounds.top - imageBounds.top) / scale,
      bounds.width / scale,
      bounds.height / scale,
      0,
      0,
      256,
      256,
    );
    return Array.from(context.getImageData(0, 0, 256, 256).data);
  });
}

async function _expectSavedImageMatchesPreview({
  page,
  url,
  expected,
}: {
  page: Page;
  url: string;
  expected: number[];
}): Promise<void> {
  const bytes = await (await page.request.get(url)).body();
  const actual = await page.evaluate(
    async (dataUrl) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: Array.from(context.getImageData(0, 0, 256, 256).data),
      };
    },
    `data:image/webp;base64,${bytes.toString("base64")}`,
  );
  expect([actual.width, actual.height]).toEqual([256, 256]);
  const error =
    actual.pixels.reduce((sum, value, index) => {
      return sum + Math.abs(value - expected[index]!);
    }, 0) / expected.length;
  expect(error).toBeLessThan(8);
}
