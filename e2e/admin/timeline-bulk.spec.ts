import { test, expect } from "./admin.fixtures.ts";
import type { Page } from "@playwright/test";

const ITEM_IDS = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
];

async function _tickPhotos(page: Page): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Select photos", exact: true })
    .click();
  for (const itemId of ITEM_IDS) {
    await page.locator(`button[data-item-id="${itemId}"]`).click();
  }
}

[
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`timeline bulk edits and confirmed deletion at ${viewport.width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/api/evidence/session/admin?to=/");
    await _tickPhotos(page);
    const toolbar = page.getByRole("region", { name: "Edit ticked photos" });
    await expect(toolbar).toContainText("2");
    await page.getByRole("button", { name: "Add a tag", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Tags", exact: true })
      .fill("summer together");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tag all 2", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const tags = await catalog.database
      .selectFrom("item_tags")
      .innerJoin("tags", "tags.id", "item_tags.tag_id")
      .select(["item_tags.item_id", "tags.name"])
      .where("tags.name", "=", "summer together")
      .execute();
    expect(
      tags
        .map((row) => {
          return row.item_id;
        })
        .sort(),
    ).toEqual(ITEM_IDS);

    await _tickPhotos(page);
    await page
      .getByRole("button", { name: "Tag somebody", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Who is in them", exact: true })
      .fill("Cousin Jo");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tag all 2", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const people = await catalog.database
      .selectFrom("people")
      .innerJoin("item_people", "item_people.person_id", "people.id")
      .select(["people.id", "item_people.item_id"])
      .where("people.display_name", "=", "Cousin Jo")
      .execute();
    expect(people).toHaveLength(2);
    expect(
      new Set(
        people.map((row) => {
          return row.id;
        }),
      ).size,
    ).toBe(1);

    await _tickPhotos(page);
    await page
      .getByRole("button", { name: "Put under a milestone", exact: true })
      .click();
    await page.getByRole("button", { name: /The first week/ }).click();
    await page.getByRole("button", { name: "Attach 2", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await catalog.database
        .selectFrom("item_milestones")
        .select("item_id")
        .where("item_id", "in", ITEM_IDS)
        .execute(),
    ).toHaveLength(2);

    await _tickPhotos(page);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("cannot be undone");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      await catalog.database
        .selectFrom("items")
        .select("id")
        .where("id", "in", ITEM_IDS)
        .execute(),
    ).toHaveLength(2);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete 2 permanently", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(`button[data-item-id="${ITEM_IDS[1]}"]`),
    ).toHaveCount(0);
    expect(
      await catalog.database
        .selectFrom("items")
        .select("id")
        .where("id", "in", ITEM_IDS)
        .execute(),
    ).toEqual([]);
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
      }),
    ).toBe(true);
  });
});
