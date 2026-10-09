import { test, expect } from "./admin.fixtures.ts";

/** The drawer accepts a tag only through an explicit selection. */
test("typing then leaving the field or drawer never creates a person", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  await page.getByRole("button", { name: "More photo details" }).click();
  await page.getByRole("button", { name: "+ Tag somebody" }).click();
  const field = page.getByRole("combobox", { name: "Who is in it" });
  await field.fill("accidental z");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "+ Tag somebody" }).click();
  await field.fill("accidental outside");
  await page
    .getByRole("dialog", { name: "Photo details" })
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.getByRole("dialog", { name: "Photo details" })).toHaveCount(
    0,
  );
  expect(
    await catalog.database
      .selectFrom("people")
      .select("id")
      .where("display_name", "like", "accidental%")
      .execute(),
  ).toHaveLength(0);
});

[1440, 390].forEach((width) => {
  test(`renames and deletes an accidental person from the menu at ${width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
    await page.getByRole("button", { name: "More photo details" }).click();
    await page.getByRole("button", { name: "+ Tag somebody" }).click();
    const field = page.getByRole("combobox", { name: "Who is in it" });
    await field.fill("accidental z");
    await field.press("Enter");
    await field.click();
    await page.getByRole("button", { name: "Rename accidental z" }).click();
    const modal = page.getByRole("dialog", { name: "Rename accidental z" });
    await modal.getByRole("textbox", { name: "Name" }).fill("Zora");
    await modal.getByRole("button", { name: "Save name" }).click();
    await expect(modal).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Untag Zora" }),
    ).toBeVisible();
    await field.click();
    await expect(
      page.getByRole("button", { name: "Delete Zora" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete Zora" }).click();
    await expect(page.getByRole("button", { name: "Untag Zora" })).toHaveCount(
      0,
    );
    await field.fill("Zora");
    await expect(
      page.getByRole("option", { name: "Zora new", exact: true }),
    ).toBeVisible();
    expect(
      await catalog.database
        .selectFrom("people")
        .select("id")
        .where("display_name", "in", ["accidental z", "Zora"])
        .execute(),
    ).toHaveLength(0);
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollWidth <= innerWidth;
      }),
    ).toBe(true);
  });
});

/** Renaming a real member through their account must make them taggable. */
test("offers Pablo for either p or P and never shows member management actions", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  const response = await page.request.patch(`${catalog.origin}/api/me`, {
    data: { displayName: "Pablo" },
    headers: { origin: catalog.origin },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "More photo details" }).click();
  await page.getByRole("button", { name: "+ Tag somebody" }).click();
  const field = page.getByRole("combobox", { name: "Who is in it" });
  await field.fill("p");
  await expect(page.getByRole("option", { name: /Pablo/ })).toBeVisible();
  await field.fill("P");
  await page.getByRole("option", { name: /Pablo/ }).click();
  await expect(page.getByRole("button", { name: "Untag Pablo" })).toBeVisible();
  await field.click();
  await expect(page.getByRole("button", { name: "Rename Pablo" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Delete Pablo" })).toHaveCount(
    0,
  );
  const tagged = await catalog.database
    .selectFrom("item_people")
    .innerJoin("people", "people.id", "item_people.person_id")
    .select("people.member_id")
    .where("item_people.item_id", "=", catalog.itemId)
    .where("people.display_name", "=", "Pablo")
    .executeTakeFirstOrThrow();
  expect(tagged.member_id).toBe(catalog.admin.memberId);
});

test("keeps an ad-hoc person and a member with the same name distinct", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  expect(
    (
      await page.request.patch(`${catalog.origin}/api/me`, {
        data: { displayName: "Pablo" },
        headers: { origin: catalog.origin },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put(
        `${catalog.origin}/api/items/${catalog.itemId}/people`,
        {
          data: { people: [{ displayName: "Pablo" }] },
          headers: { origin: catalog.origin },
        },
      )
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "More photo details" }).click();
  await page.getByRole("button", { name: "+ Tag somebody" }).click();
  await page.getByRole("combobox", { name: "Who is in it" }).fill("Pablo");
  await expect(page.getByRole("option", { name: /Pablo/ })).toHaveCount(2);
  await page
    .getByRole("option", { name: "Pablo none yet", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Untag Pablo" })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Untag Pablo" }).first().click();
  await expect(page.getByRole("button", { name: "Untag Pablo" })).toHaveCount(
    1,
  );
  await expect
    .poll(async () => {
      return catalog.database
        .selectFrom("item_people")
        .innerJoin("people", "people.id", "item_people.person_id")
        .select("people.member_id")
        .where("item_people.item_id", "=", catalog.itemId)
        .execute();
    })
    .toEqual([{ member_id: catalog.admin.memberId }]);
});

test("keyboard activation opens rename without submitting the search text", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  await page.getByRole("button", { name: "More photo details" }).click();
  await page.getByRole("button", { name: "+ Tag somebody" }).click();
  const field = page.getByRole("combobox", { name: "Who is in it" });
  await field.fill("Zora keyboard");
  await field.press("Enter");
  await field.fill("Zora");
  const rename = page.getByRole("button", { name: "Rename Zora keyboard" });
  await expect(rename).toBeVisible();
  await field.press("Tab");
  await expect(rename).toBeFocused();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", { name: "Rename Zora keyboard" });
  await expect(modal.getByRole("textbox", { name: "Name" })).toBeFocused();
  await modal.getByRole("button", { name: "Cancel" }).click();
  expect(
    await catalog.database
      .selectFrom("people")
      .select("display_name")
      .where("display_name", "=", "Zora")
      .execute(),
  ).toHaveLength(0);
});
