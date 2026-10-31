import { test, expect } from "./media.fixtures.ts";

test.use({ catalogSize: 30, responsivePhotos: true });

[1280, 390].forEach((width) => {
  test(`full burst and additive range selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/api/media-evidence/session");
    await page
      .getByRole("button", { name: "Select photos", exact: true })
      .click();
    const cover = page.locator("[data-burst-stack]").first();
    await cover.hover();
    await cover.getByRole("checkbox", { name: "Select full burst" }).click();
    const toolbar = page.getByRole("region", { name: "Edit ticked photos" });
    await expect(toolbar).toContainText("5ticked");
    await expect(
      page.getByRole("button", { name: "Collapse", exact: true }),
    ).toHaveCount(0);
    await cover.locator("button").first().click();
    await expect(
      page.getByRole("button", { name: "Full burst selected" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Collapse", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Collapse", exact: true }),
    ).toHaveCount(0);
    await expect(toolbar).toContainText("5ticked");
    const prints = page.locator(
      '[data-print-selection="timeline"] button[aria-pressed]',
    );
    const first = prints.first();
    const third = prints.nth(2);
    await first.click({ modifiers: ["Shift"] });
    await third.click({ modifiers: ["Shift"] });
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(prints.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(third).toHaveAttribute("aria-pressed", "true");
    await expect(toolbar).toContainText("8ticked");
  });

  test(`burst menu belongs to the moving paper at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/api/media-evidence/session");
    await page
      .locator("[data-burst-stack]")
      .first()
      .getByRole("button")
      .click();
    const menu = page
      .getByRole("button", { name: /Photo \d+ options/ })
      .first();
    await expect(menu).toBeVisible();
    const paper = menu.locator('xpath=ancestor::*[@data-photo-surface="pile"]');
    await expect(paper).toHaveCount(1);
    await paper.hover();
    expect(
      await menu.evaluate((element) => {
        return element.parentElement?.closest("button") === null;
      }),
    ).toBe(true);
    const size = await menu.boundingBox();
    expect(size!.width).toBeLessThan(55);
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Make standalone" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

test("timeline hover warms the viewing image and click reuses its body", async ({
  page,
  catalog,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/api/media-evidence/session");
  const itemId = catalog.itemIds.at(-1)!;
  const paper = page.locator(`[data-item-id="${itemId}"]`);
  const getDisplayBytes = () => {
    return catalog
      .getTransfers()
      .filter((transfer) => {
        return (
          transfer.objectId.includes(`/${itemId}/`) &&
          !transfer.objectId.endsWith("/thumb")
        );
      })
      .reduce((bytes, transfer) => {
        return bytes + transfer.bodyBytes;
      }, 0);
  };
  expect(getDisplayBytes()).toBe(0);
  await paper.hover();
  await expect.poll(getDisplayBytes).toBeGreaterThan(0);
  const warmedBytes = getDisplayBytes();
  await paper.getByRole("button").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
  expect(getDisplayBytes()).toBe(warmedBytes);
});

test("narrow portrait menu targets remain inside their paper", async ({
  page,
}) => {
  await page.route("**/api/bursts/*/frames*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        frames: body.frames.map((frame: { thumb: object }) => {
          return {
            ...frame,
            width: 9,
            height: 32,
            thumb: { ...frame.thumb, width: 9, height: 32 },
          };
        }),
      },
    });
  });
  await page.goto("/api/media-evidence/session");
  await page.locator("[data-burst-stack]").first().getByRole("button").click();
  const menus = page.getByRole("button", { name: /Photo \d+ options/ });
  await expect(menus).toHaveCount(5);
  const first = menus.first();
  const bounds = await first.evaluate((menu) => {
    const paper = menu.closest<HTMLElement>('[data-photo-surface="pile"]')!;
    return {
      left: (menu as HTMLElement).offsetLeft,
      right:
        (menu as HTMLElement).offsetLeft + (menu as HTMLElement).offsetWidth,
      width: paper.clientWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  await first.click();
  await expect(
    page.getByRole("menuitem", { name: "Make standalone" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
