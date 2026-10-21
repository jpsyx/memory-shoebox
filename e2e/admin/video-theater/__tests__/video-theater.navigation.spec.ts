import { test, expect } from "../../admin.fixtures.ts";
import {
  moveTheater,
  useWindowTheater,
} from "../../support/theaterTestHelpers.ts";

for (const mode of ["native", "window"] as const) {
  test(`${mode} host survives mixed navigation, mode changes and current-item Back`, async ({
    page,
    catalog,
  }, testInfo) => {
    if (mode === "window") {
      await useWindowTheater(page);
    }
    await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
    const host = page.locator("[data-item-theater-host]");
    const originalHost = await host.elementHandle();
    await expect(page.locator("[data-photo-surface=viewer]")).toHaveAttribute(
      "data-photo-ready",
      "true",
    );
    const photo = await page
      .getByRole("img", { name: "A family memory" })
      .elementHandle();
    const composer = await page
      .getByRole("textbox", { name: "Write a comment" })
      .elementHandle();
    await page
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Full screen" }),
    ).toBeVisible();
    expect(
      await photo!.evaluate((element) => {
        return element.isConnected;
      }),
    ).toBe(true);
    expect(
      await composer!.evaluate((element) => {
        return element.isConnected;
      }),
    ).toBe(true);
    if (
      mode === "native" &&
      (await page.evaluate(() => {
        return document.fullscreenEnabled;
      }))
    ) {
      await expect
        .poll(() => {
          return host.evaluate((element) => {
            return document.fullscreenElement === element;
          });
        })
        .toBe(true);
    }
    const hasNative = await host.evaluate((element) => {
      return document.fullscreenElement === element;
    });
    testInfo.annotations.push({
      type: "fullscreen",
      description: `${mode}: native=${hasNative}`,
    });
    if (mode === "window") {
      expect(hasNative).toBe(false);
    }
    await moveTheater(page, "Previous");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
    await expect(page.locator("video")).toHaveCount(1);
    expect(
      await originalHost!.evaluate((element) => {
        return element === document.querySelector("[data-item-theater-host]");
      }),
    ).toBe(true);
    if (hasNative) {
      expect(
        await originalHost!.evaluate((element) => {
          return element === document.fullscreenElement;
        }),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Leave full screen", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Enter full screen", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Enter full screen", exact: true })
        .click();
      await expect
        .poll(() => {
          return originalHost!.evaluate((element) => {
            return element === document.fullscreenElement;
          });
        })
        .toBe(true);
    }
    const video = await page.locator("video").elementHandle();
    const reads = await catalog.database
      .selectFrom("item_views")
      .select("open_count")
      .where("item_id", "=", catalog.videoId)
      .where("member_id", "=", catalog.admin.memberId)
      .executeTakeFirstOrThrow();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Enter full screen", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
    expect(
      await video!.evaluate((element: HTMLVideoElement) => {
        return element.isConnected && element.paused;
      }),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
    expect(
      await video!.evaluate((element) => {
        return element.isConnected;
      }),
    ).toBe(true);
    expect(
      await catalog.database
        .selectFrom("item_views")
        .select("open_count")
        .where("item_id", "=", catalog.videoId)
        .where("member_id", "=", catalog.admin.memberId)
        .executeTakeFirstOrThrow(),
    ).toEqual(reads);
    await moveTheater(page, "Next");
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
    if (hasNative) {
      expect(
        await originalHost!.evaluate((element) => {
          return element === document.fullscreenElement;
        }),
      ).toBe(true);
    }
  });
}

test("accurate counter follows authorized neighbor walk and ancillary failure never blocks media", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  let releasePosition!: () => void;
  const gate = new Promise<void>((release) => {
    releasePosition = release;
  });
  await page.route("**/api/media/position", async (route) => {
    await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await expect(page.locator("video")).toBeVisible();
  const title = page.locator('[data-item-theater-host] [aria-live="polite"]');
  await expect(title).not.toContainText(/\d\/\d/);
  releasePosition();
  await expect(title).toContainText("1/3");
  for (const [index, suffix] of [
    [2, "000000000012"],
    [3, "000000000010"],
  ] as const) {
    await moveTheater(page, "Next");
    await expect(page).toHaveURL(new RegExp(`${suffix}$`));
    await expect(title).toContainText(`${index}/3`);
  }
  await expect(
    page.getByRole("button", { name: "Next photo or video" }),
  ).toHaveAttribute("aria-disabled", "true");
  await moveTheater(page, "Previous");
  await expect(title).toContainText("2/3");
  await page.route("**/api/media/position", (route) => {
    return route.fulfill({
      status: 500,
      json: { error: "internal", message: "Position unavailable" },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "A family memory" }),
  ).toBeVisible();
  await expect(title).not.toContainText(/\d\/\d/);
});

test("Back restores actual page scroll and entry focus", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  await expect(
    page.getByRole("img", { name: "A family memory" }),
  ).toBeVisible();
  await page.evaluate(() => {
    return window.scrollTo(0, 150);
  });
  const before = await page.evaluate(() => {
    return window.scrollY;
  });
  expect(before).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect
    .poll(() => {
      return page.evaluate(() => {
        return window.scrollY;
      });
    })
    .toBe(before);
  await expect(
    page.getByRole("button", { name: "Enter full screen", exact: true }),
  ).toBeFocused();
});
