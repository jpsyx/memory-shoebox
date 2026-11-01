import { fileURLToPath as fileUrlToPath } from "node:url";
import { test, expect, signIn } from "./support/commentTaggingFixtures.ts";

const PHOTO = fileUrlToPath(
  new URL("../fixtures/upload/portrait-orientation-6.jpg", import.meta.url),
);

["retry", "skip"].forEach((recovery) => {
  test(`real completion route preserves staged photo after name collision and failed upload: ${recovery}`, async ({
    page,
    catalog,
  }) => {
    await signIn(page, catalog, "Incomplete");
    const destination = `/items/${catalog.itemId}?comment=${catalog.commentId}`;
    await page.goto(destination);
    await expect(page).toHaveURL(/complete-profile/);
    await page.getByLabel("Choose photo file").setInputFiles(PHOTO);
    await page.getByRole("button", { name: "Save photo", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText(
        "That name is already taken. Try adding your last-name initial, like John M.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Your name" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Change photo" }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Your name" }).fill("John M");
    await page.route("**/api/me/avatar-uploads/*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 503,
          json: {
            error: "avatar_busy",
            message: "Photo saving is busy. Try again.",
          },
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Continue without a photo" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/complete-profile/);
    expect(
      (
        await catalog.database
          .selectFrom("members")
          .select("display_name")
          .where("id", "=", catalog.members.Incomplete.memberId)
          .executeTakeFirstOrThrow()
      ).display_name,
    ).toBe("John M");
    await page.unroute("**/api/me/avatar-uploads/*");
    await page
      .getByRole("button", {
        name: recovery === "retry" ? "Try again" : "Continue without a photo",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(`${catalog.origin}${destination}`);
    await expect(
      page.getByRole("article").filter({ hasText: "A remembered afternoon." }),
    ).toBeFocused();
    const member = await catalog.database
      .selectFrom("members")
      .select("avatar_id")
      .where("id", "=", catalog.members.Incomplete.memberId)
      .executeTakeFirstOrThrow();
    expect(member.avatar_id !== null).toBe(recovery === "retry");
  });
});

test("account notification switch persists, focuses from link, and failure restores saved value", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog, "Jorge");
  await page.goto("/account?email=comment-tag");
  const toggle = page.getByRole("switch", {
    name: "Somebody tags you in a comment",
  });
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await toggle.press("Space");
  await expect(
    page.getByText(
      "You may still receive emails about your uploads or conversations, depending on your other settings.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  let releaseFailure = (): void => {};
  const failureReady = new Promise<void>((settle) => {
    releaseFailure = settle;
  });
  await page.route("**/api/me", async (route) => {
    if (route.request().method() === "PATCH") {
      await failureReady;
    }
    return route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          json: { error: "internal", message: "Test save failure" },
        })
      : route.continue();
  });
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeDisabled();
  releaseFailure();
  await expect(toggle).not.toBeChecked();
  await expect(
    page.getByText("Couldn't change that email preference. Try again."),
  ).toBeVisible();
  await expect(toggle).toBeFocused();
});

test("80-character photo identity suffix remains visible in item chips, directory and active filters at 320 and 390", async ({
  page,
  catalog,
}) => {
  const { LONG_PERSON_NAME } =
    await import("./support/runCommentTaggingServer.ts");
  expect(LONG_PERSON_NAME).toHaveLength(80);
  await signIn(page, catalog, "Uploader");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`/items/${catalog.itemId}`);
  await page.getByRole("button", { name: "More photo details" }).click();
  await expect(
    page.getByText(`${LONG_PERSON_NAME} (not a member)`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Photo-tag someone" }).click();
  await expect(
    page.getByRole("button", { name: `Untag ${LONG_PERSON_NAME}` }),
  ).toBeVisible();
  const longLabel = page
    .getByText(`${LONG_PERSON_NAME} (not a member)`, { exact: true })
    .first();
  const dimensions = await longLabel.evaluate((element) => {
    return {
      scroll: element.scrollWidth,
      width: element.clientWidth,
    };
  });
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(longLabel).toBeVisible();
  await page.goto("/people");
  const card = page.getByRole("link", { name: new RegExp(LONG_PERSON_NAME) });
  await expect(card).toContainText("(not a member)");
  await card.click();
  await expect(
    page.getByText(`${LONG_PERSON_NAME} (not a member)`, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollWidth <= innerWidth;
    }),
  ).toBe(true);
});

test("upload and archive bulk pickers keep the long ad-hoc suffix and separate same-name member", async ({
  page,
  catalog,
}) => {
  const { LONG_PERSON_NAME } =
    await import("./support/runCommentTaggingServer.ts");
  await signIn(page, catalog, "Uploader");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Select photos", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Hidden distinctive memory 7391 Nobody yet Not seen yet",
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Photo-tag someone", exact: true })
    .click();
  const field = page.getByRole("combobox", {
    name: "Who is in them",
    exact: true,
  });
  await field.fill("Jorge");
  await expect(
    page.getByRole("option", { name: /Jorge \(not a member\)/ }),
  ).toBeVisible();
  await field.fill(LONG_PERSON_NAME);
  await page
    .getByRole("option", { name: new RegExp(LONG_PERSON_NAME) })
    .click();
  await field.press("Escape");
  await expect(
    page.getByText(`${LONG_PERSON_NAME} (not a member)`, { exact: true }),
  ).toBeVisible();
  expect(
    await page.getByRole("dialog").evaluate((element) => {
      return element.scrollWidth <= element.clientWidth;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: /^portrait-orientation-6.jpg/ })
    .click();
  await page
    .getByRole("button", { name: "Photo-tag someone", exact: true })
    .click();
  await field.fill(LONG_PERSON_NAME);
  await page
    .getByRole("option", { name: new RegExp(LONG_PERSON_NAME) })
    .click();
  await field.press("Escape");
  await expect(
    page.getByText(`${LONG_PERSON_NAME} (not a member)`, { exact: true }),
  ).toBeVisible();
  expect(
    await page.getByRole("dialog").evaluate((element) => {
      return element.scrollWidth <= element.clientWidth;
    }),
  ).toBe(true);
});
