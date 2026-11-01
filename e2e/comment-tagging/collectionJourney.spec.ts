import {
  expectComposerInstruction,
  expectSavedSelectedTag,
} from "./collectionJourneyTestHelpers.ts";
import {
  expect,
  selectTag,
  signIn,
  submitComment,
  test,
} from "./support/commentTaggingFixtures.ts";

test("pending post acknowledges only its submitted draft through collection departure and return", async ({
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
  const field = page.getByRole("textbox", { name: "Write a comment" });
  await field.fill("Submitted words");
  const held = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  await page.route(`**/api/items/${catalog.itemId}/comments`, async (route) => {
    const response = await route.fetch();
    started.resolve();
    await held.promise;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await started.promise;
  await field.fill("Newer words ");
  await selectTag(page, field);
  await page
    .getByRole("link", { name: "Jorge, view photos and videos", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Back to comment" }),
  ).toBeVisible();
  held.resolve();
  await page.getByRole("link", { name: "Back to comment" }).click();
  await expect(field).toHaveValue("Newer words @Jorge ");
  await expect(
    page.getByRole("article").filter({ hasText: "Submitted words" }),
  ).toBeVisible();
  await page.unroute(`**/api/items/${catalog.itemId}/comments`);
  await expectSavedSelectedTag(
    page,
    await submitComment(page, field),
    catalog.members.Jorge.memberId,
    "Newer words @Jorge ",
    12,
  );
});

["main", "reply", "edit"].forEach((mode) => {
  test(`${mode} draft and selected identity survive collection and back without video resume`, async ({
    page,
    catalog,
  }) => {
    await signIn(page, catalog);
    const anchor = await page.request.post(
      `${catalog.origin}/api/items/${catalog.videoId}/comments`,
      {
        data: {
          body: "@Jorge look here",
          commentTags: [
            { memberId: catalog.members.Jorge.memberId, start: 0, end: 6 },
          ],
        },
      },
    );
    expect(anchor.ok()).toBe(true);
    await page.request.post(
      `${catalog.origin}/api/items/${catalog.videoId}/comments`,
      {
        data: {
          body: "@Jorge another doorway",
          commentTags: [
            { memberId: catalog.members.Jorge.memberId, start: 0, end: 6 },
          ],
        },
      },
    );
    await page.goto(`/items/${catalog.videoId}`);
    const link = page.getByRole("link", {
      name: "Jorge, view photos and videos",
      exact: true,
    });
    await expect(link.first()).toBeVisible();
    if (mode === "reply") {
      await page.getByRole("button", { name: "Reply to Jorge" }).click();
    }
    if (mode === "edit") {
      await page
        .getByRole("article")
        .filter({ hasText: "@Jorge look here" })
        .getByRole("button", { name: "Edit", exact: true })
        .click();
    }
    const field = page.getByRole("textbox", {
      name:
        mode === "reply"
          ? "Reply to Jorge"
          : mode === "edit"
            ? "What you wrote"
            : "Write a comment",
    });
    await expectComposerInstruction(page, field);
    await field.fill("Remember this ");
    await selectTag(page, field);
    await link.first().click();
    await expect(
      page.getByText(
        "Photos and videos uploaded by or photo-tagged with Jorge",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("Hidden distinctive memory 7391")).toHaveCount(
      0,
    );
    await page
      .getByRole("link", { name: "Back to comment", exact: true })
      .click();
    await expect(field).toHaveValue("Remember this @Jorge ");
    expect(
      await page.locator("video").evaluate((video: HTMLVideoElement) => {
        return video.paused;
      }),
    ).toBe(true);
    await expectSavedSelectedTag(
      page,
      await submitComment(page, field),
      catalog.members.Jorge.memberId,
      "Remember this @Jorge ",
      14,
    );
  });
});
