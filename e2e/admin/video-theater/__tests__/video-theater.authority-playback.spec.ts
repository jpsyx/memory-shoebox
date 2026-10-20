import { test, expect } from "../../admin.fixtures.ts";
import {
  moveTheater,
  openTheaterComments,
  useWindowTheater,
} from "../../support/theaterTestHelpers.ts";

test("slow then denied actual detail keeps host and never exposes old conversation", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await (await openTheaterComments(page)).fill("Private previous draft");
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>((release) => {
    releaseDetail = release;
  });
  await page.route(`**/api/items/${catalog.itemId}`, async (route) => {
    await detailGate;
    await route.fulfill({
      status: 404,
      json: { error: "not_found", message: "Not found" },
    });
  });
  const host = await page.locator("[data-item-theater-host]").elementHandle();
  await moveTheater(page, "Next");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeVisible();
  releaseDetail();
  await expect(
    page.getByText("This one is not here.", { exact: true }),
  ).toBeVisible();
  expect(
    await host!.evaluate((element) => {
      return element.isConnected;
    }),
  ).toBe(true);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "A family memory" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Media theater" })).toHaveCount(
    0,
  );
});

test("actual detail retry retains host and grants no writes before authorization", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  const host = await page.locator("[data-item-theater-host]").elementHandle();
  await page.route(
    `**/api/items/${catalog.itemId}`,
    (route) => {
      return route.fulfill({
        status: 500,
        json: { error: "internal", message: "Detail unavailable" },
      });
    },
    { times: 2 },
  );
  await moveTheater(page, "Next");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "A family memory" }),
  ).toBeVisible();
  expect(
    await host!.evaluate((element) => {
      return element.isConnected;
    }),
  ).toBe(true);
  await expect(await openTheaterComments(page)).toBeEditable();
});

test("autoplay refusal leaves usable Play and controls keep their arrow keys", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.hasAttribute("data-refused-once")) {
        this.setAttribute("data-refused-once", "true");
        return Promise.reject(
          new DOMException("Autoplay refused", "NotAllowedError"),
        );
      }
      return originalPlay.call(this);
    };
  });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("video")).toHaveJSProperty("paused", false);
  await expect(
    page.getByRole("button", { name: "React: Laugh", exact: true }),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: "Where in the video" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await page.getByRole("combobox", { name: "Playback speed" }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await openTheaterComments(page);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
});
