import {
  expect,
  selectTag,
  signIn,
  submitComment,
  test,
} from "./support/commentTaggingFixtures.ts";

test("collection hides inaccessible rows and totals while pending and settled; new tabs have no return promise", async ({
  page,
  catalog,
  browserName,
}) => {
  await signIn(page, catalog);
  const identityStarted = Promise.withResolvers<void>();
  const releaseIdentity = Promise.withResolvers<void>();
  await page.route("**/api/member-collections/*", async (route) => {
    identityStarted.resolve();
    await releaseIdentity.promise;
    await route.continue();
  });
  await page.goto(`/?member=${catalog.members.Jorge.memberId}`);
  await identityStarted.promise;
  await expect(page.getByText(/7391|\b(?:125|34)\b/)).toHaveCount(0);
  releaseIdentity.resolve();
  await expect(
    page.getByText("Photos and videos uploaded by or photo-tagged with Jorge", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to comment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to the timeline", exact: true }),
  ).toBeVisible();
  await expect(page.locator(`a[href*="${catalog.hiddenId}"]`)).toHaveCount(0);
  await expect(page.getByText(/7391|\b(?:125|34)\b/)).toHaveCount(0);
  const current = await page.request.get(
    `${catalog.origin}/api/items/${catalog.hiddenId}`,
  );
  expect(current.status()).toBe(404);
  await page.goto(`/items/${catalog.itemId}`);
  const field = page.getByRole("textbox", { name: "Write a comment" });
  await selectTag(page, field);
  expect((await submitComment(page, field)).ok()).toBe(true);
  const link = page.getByRole("link", {
    name: "Jorge, view photos and videos",
    exact: true,
  });
  const popup =
    browserName === "webkit"
      ? await page.context().newPage()
      : await (async () => {
          const opened = page.context().waitForEvent("page");
          await link.click({ button: "middle" });
          return opened;
        })();
  if (browserName === "webkit") {
    // WebKit phone has no desktop middle-button gesture. Open its real href.
    await popup.goto(
      new URL((await link.getAttribute("href"))!, catalog.origin).href,
    );
  }
  await expect(
    popup.getByText(
      "Photos and videos uploaded by or photo-tagged with Jorge",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    popup.getByRole("link", { name: "Back to comment", exact: true }),
  ).toHaveCount(0);
  await popup.close();
});

test("access refusal after collection departure retires private draft and quoted content", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.request.post(
    `${catalog.origin}/api/items/${catalog.itemId}/comments`,
    {
      data: {
        body: "@Jorge doorway",
        commentTags: [
          { memberId: catalog.members.Jorge.memberId, start: 0, end: 6 },
        ],
      },
    },
  );
  await page.goto(`/items/${catalog.itemId}`);
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("Sensitive unfinished words");
  await page
    .getByRole("link", { name: "Jorge, view photos and videos", exact: true })
    .click();
  const hidden = await catalog.database
    .selectFrom("items")
    .select("visibility_rule_id")
    .where("id", "=", catalog.hiddenId)
    .executeTakeFirstOrThrow();
  await catalog.database
    .updateTable("items")
    .set({ visibility_rule_id: hidden.visibility_rule_id })
    .where("id", "=", catalog.itemId)
    .execute();
  await page.getByRole("link", { name: "Back to comment" }).click();
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /Sensitive unfinished words|A remembered afternoon|@Jorge doorway/,
    ),
  ).toHaveCount(0);
});

test("member changes during a held next page cannot retain the preceding collection", async ({
  page,
  catalog,
}) => {
  await Promise.all(
    catalog.itemIds.map((itemId, index) => {
      const day = new Date(Date.UTC(2026, 9, 30 - index))
        .toISOString()
        .slice(0, 10);
      return catalog.database
        .updateTable("items")
        .set({ captured_on: day, captured_at: `${day}T12:00:00.000Z` })
        .where("id", "=", itemId)
        .execute();
    }),
  );
  await signIn(page, catalog);
  await page.request.post(
    `${catalog.origin}/api/items/${catalog.itemId}/comments`,
    {
      data: {
        body: "@Jorge @John",
        commentTags: [
          { memberId: catalog.members.Jorge.memberId, start: 0, end: 6 },
          { memberId: catalog.members.John.memberId, start: 7, end: 12 },
        ],
      },
    },
  );
  await page.goto(`/items/${catalog.itemId}`);
  const held = Promise.withResolvers<void>();
  let hasNextPageStarted = false;
  await page.route("**/api/timeline?*", async (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      hasNextPageStarted = true;
      await held.promise;
    }
    await route.continue().catch(() => {});
  });
  await page
    .getByRole("link", { name: "Jorge, view photos and videos", exact: true })
    .click();
  await expect(
    page.getByText("Photos and videos uploaded by or photo-tagged with Jorge", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Measurement memory 1", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    return window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect
    .poll(() => {
      return hasNextPageStarted;
    })
    .toBe(true);
  await page.goBack();
  await page
    .getByRole("link", { name: "John, view photos and videos", exact: true })
    .click();
  held.resolve();
  await expect(
    page.getByText("Photos and videos uploaded by or photo-tagged with John", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No photos or videos to show.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Photos and videos uploaded by or photo-tagged with Jorge", {
      exact: true,
    }),
  ).toHaveCount(0);
});
