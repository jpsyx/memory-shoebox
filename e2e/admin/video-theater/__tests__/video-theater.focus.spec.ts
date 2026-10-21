import { test, expect } from "../../admin.fixtures.ts";
import {
  moveTheater,
  openTheaterComments,
  pauseTheaterVideo,
  useWindowTheater,
} from "../../support/theaterTestHelpers.ts";

for (const activation of ["hover", "keyboard"] as const) {
  test(`${activation} dock autofocus captures, pauses, restores focus and retains drafts`, async ({
    page,
    catalog,
  }) => {
    await useWindowTheater(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(
      `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
    );
    await page
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
    await pauseTheaterVideo(page, 6);
    const trigger = page.getByRole("button", { name: /^Open comments,/ });
    if (activation === "hover") {
      const bounds = (await trigger.boundingBox())!;
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
    } else {
      await trigger.focus();
      await trigger.press("ArrowUp");
    }
    const field = page.getByRole("textbox", { name: "Write a comment" });
    await expect(field).toBeFocused();
    await expect(
      page.getByRole("button", {
        name: "Comment at 0:06; switch to whole video",
      }),
    ).toBeVisible();
    await expect(page.locator("video")).toHaveJSProperty("paused", true);
    if (activation === "hover") {
      // Autofocus must not pin hover mode; delay is also proven precisely by unit timers.
      await page.mouse.move(640, 200);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
      await openTheaterComments(page);
    }
    await field.fill("Keep this video draft");
    await field.press("ArrowLeft");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
    await field.press("Escape");
    await expect(trigger).toBeFocused();
    await openTheaterComments(page);
    await expect(field).toHaveValue("Keep this video draft");
    await page
      .getByRole("button", { name: "Next photo or video" })
      .dispatchEvent("click");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
    await expect(trigger).toBeFocused();
    await (await openTheaterComments(page)).fill("Separate photo draft");
    await field.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
    await moveTheater(page, "Previous");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
    await openTheaterComments(page);
    await expect(field).toHaveValue("Keep this video draft");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(field).toHaveValue("Keep this video draft");
  });
}

test("window focus wraps, Escape layers, and document navigation leaves an unlocked page", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeFocused();
  await back.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: /^Open comments,/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(back).toBeFocused();
  const field = await openTheaterComments(page);
  await field.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-theater-comment-panel]")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(page.locator("[data-theater-comment-panel]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.getByRole("dialog", { name: "Full screen" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Enter full screen", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await page.goto("/");
  expect(
    await page.evaluate(() => {
      return document.body.style.overflow;
    }),
  ).not.toBe("hidden");
  expect(
    await page.evaluate(() => {
      return document.querySelectorAll("[inert]").length;
    }),
  ).toBe(0);
});

for (const exitDuringPending of [false, true]) {
  test(`pending dock focus retires after ${exitDuringPending ? "Back" : "an explicit header focus move"}`, async ({
    page,
    catalog,
  }) => {
    await useWindowTheater(page);
    await page.goto(
      `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
    );
    await page
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
    await (
      await openTheaterComments(page)
    ).fill("Retain without stealing focus");
    let releaseDetail!: () => void;
    const gate = new Promise<void>((release) => {
      releaseDetail = release;
    });
    await page.route(`**/api/items/${catalog.itemId}`, async (route) => {
      await gate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Next photo or video" })
      .dispatchEvent("click");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
    const control = page.getByRole("button", {
      name: exitDuringPending ? "Back" : "Enter full screen",
      exact: true,
    });
    await control.focus();
    await control.press("Enter");
    releaseDetail();
    if (exitDuringPending) {
      await expect(
        page.getByRole("button", { name: "Enter full screen", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("dialog", { name: "Full screen" }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("img", { name: "A family memory" }),
      ).toBeVisible();
      await expect(control).toBeFocused();
    }
  });
}

test("reduced-motion change permits immediate comment reopening after collapse", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  const field = await openTheaterComments(page);
  await field.fill("Reopen the same composer");
  await field.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTheaterComments(page);
  await expect(field).toHaveValue("Reopen the same composer");
});
