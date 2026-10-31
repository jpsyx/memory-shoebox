import {
  test,
  expect,
  signIn,
  selectTag,
  submitComment,
} from "./support/commentTaggingFixtures.ts";

test("typed text stays plain; selected repeated and self tags persist with one recorded target email", async ({
  page,
  catalog,
  browserName,
}) => {
  await signIn(page, catalog);
  await page.goto(`/items/${catalog.itemId}`);
  const field = page.getByRole("textbox", { name: "Write a comment" });
  await field.fill("Typed @Jorge stays plain.");
  expect((await submitComment(page, field)).ok()).toBe(true);
  await expect(
    page.getByText("Typed @Jorge stays plain.", { exact: true }),
  ).toBeVisible();
  await catalog.drainMail();
  expect(
    catalog.sender.sent.filter((mail) => {
      return mail.subject.includes("tagged");
    }),
  ).toHaveLength(0);
  if (browserName === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: catalog.origin,
      });
    const previousClipboard = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });
    try {
      await page.evaluate(() => {
        return navigator.clipboard.writeText("Pasted @Jorge stays plain.");
      });
      await field.focus();
      await field.press("Meta+V");
      await expect(field).toHaveValue("Pasted @Jorge stays plain.");
      expect((await submitComment(page, field)).ok()).toBe(true);
    } finally {
      await page.evaluate((value) => {
        return navigator.clipboard.writeText(value);
      }, previousClipboard);
    }
    await catalog.drainMail();
    expect(
      catalog.sender.sent.filter((message) => {
        return message.subject.includes("tagged");
      }),
    ).toHaveLength(0);
  }
  await selectTag(page, field);
  await selectTag(page, field);
  await selectTag(page, field, "Ana");
  expect((await submitComment(page, field)).ok()).toBe(true);
  const tags = page.getByRole("link", {
    name: "Jorge, view photos and videos",
    exact: true,
  });
  await expect(tags).toHaveCount(2);
  await expect(tags.first()).toHaveAttribute(
    "href",
    `/?member=${catalog.members.Jorge.memberId}`,
  );
  await catalog.drainMail();
  expect(
    catalog.sender.sent.filter((mail) => {
      return (
        mail.to === "jorge@example.test" && mail.subject.includes("tagged")
      );
    }),
  ).toHaveLength(1);
  expect(
    catalog.sender.sent.filter((mail) => {
      return mail.to === "ana@example.test";
    }),
  ).toHaveLength(0);
  await page.reload();
  await expect(tags).toHaveCount(2);
});

test("stale selected name is corrected and removed target becomes plain text", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto(`/items/${catalog.itemId}`);
  const field = page.getByRole("textbox", { name: "Write a comment" });
  await selectTag(page, field);
  const renamed = await catalog.app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: { cookie: catalog.members.Jorge.cookie },
    payload: { displayName: "Jorge M" },
  });
  expect(renamed.statusCode).toBe(200);
  expect((await submitComment(page, field)).status()).toBe(409);
  await expect(
    page.getByText("This member is now called Jorge M."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use updated name" }).click();
  await expect(field).toHaveValue("@Jorge M ");
  expect((await submitComment(page, field)).ok()).toBe(true);
  await selectTag(page, field, "Jorge M");
  await catalog.database
    .updateTable("members")
    .set({ status: "removed", removed_at: new Date().toISOString() })
    .where("id", "=", catalog.members.Jorge.memberId)
    .execute();
  expect((await submitComment(page, field)).status()).toBe(409);
  await expect(
    page.getByText("Jorge M can't be tagged here now."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep as plain text" }).click();
  expect((await submitComment(page, field)).ok()).toBe(true);
  await expect(
    page.getByRole("link", {
      name: "Jorge M, view photos and videos",
      exact: true,
    }),
  ).toHaveCount(1);
  await catalog.drainMail();
  expect(
    catalog.sender.sent.filter((mail) => {
      return mail.to === "jorge@example.test";
    }),
  ).toHaveLength(0);
});

test("reply and edit tags record new recipients only; preference off retains ordinary upload mail", async ({
  page,
  catalog,
}) => {
  await signIn(page, catalog);
  await page.goto(`/items/${catalog.videoId}`);
  await page.getByRole("button", { name: "Reply to Jorge" }).click();
  const reply = page.getByRole("textbox", { name: "Reply to Jorge" });
  await selectTag(page, reply);
  const posted = await (await submitComment(page, reply)).json();
  await catalog.drainMail();
  expect(
    catalog.sender.sent.filter((mail) => {
      return (
        mail.to === "jorge@example.test" && mail.subject.includes("tagged")
      );
    }),
  ).toHaveLength(1);
  const article = page.locator(`[data-comment-id="${posted.commentId}"]`);
  await article.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("textbox", { name: "What you wrote" });
  await edit.fill("Updated ");
  await selectTag(page, edit);
  await selectTag(page, edit, "Uploader");
  expect((await submitComment(page, edit)).ok()).toBe(true);
  await catalog.drainMail();
  expect(
    catalog.sender.sent.filter((mail) => {
      return (
        mail.to === "jorge@example.test" && mail.subject.includes("tagged")
      );
    }),
  ).toHaveLength(1);
  expect(
    catalog.sender.sent.filter((mail) => {
      return (
        mail.to === "uploader@example.test" && mail.subject.includes("tagged")
      );
    }),
  ).toHaveLength(1);
  await catalog.database
    .updateTable("members")
    .set({ notify_on_comment_tag: 0 })
    .where("id", "=", catalog.members.Jorge.memberId)
    .execute();
  await page.goto(`/items/${catalog.itemIds[1]}`);
  const main = page.getByRole("textbox", { name: "Write a comment" });
  await selectTag(page, main);
  expect((await submitComment(page, main)).ok()).toBe(true);
  await catalog.drainMail();
  const received = catalog.sender.sent.filter((mail) => {
    return mail.to === "jorge@example.test";
  });
  expect(received).toHaveLength(2);
  expect(received[1]!.subject).not.toContain("tagged");
});

test("captured tag email href survives real sign-in and profile completion without autoplay or seek", async ({
  page,
  catalog,
}) => {
  const { startSecureCommentTaggingProxy } =
    await import("./support/runCommentTaggingServer.ts");
  const secure = await startSecureCommentTaggingProxy(catalog);
  const secureCatalog = { ...catalog, origin: secure.origin };
  try {
    await signIn(page, secureCatalog);
    await page.goto(`${secure.origin}/items/${catalog.videoId}`);
    const field = page.getByRole("textbox", { name: "Write a comment" });
    await selectTag(page, field);
    expect((await submitComment(page, field)).ok()).toBe(true);
    await catalog.drainMail();
    const tagEmail = catalog.sender.sent.find((mail) => {
      return (
        mail.to === "jorge@example.test" && mail.subject.includes("tagged")
      );
    })!;
    const href = tagEmail.html
      .match(/href="([^"]+\?comment=[^"]+)"/)?.[1]
      ?.replaceAll("&amp;", "&");
    expect(href).toContain(secure.origin);
    await catalog.database
      .updateTable("members")
      .set({ profile_completed_at: null })
      .where("id", "=", catalog.members.Jorge.memberId)
      .execute();
    await page.context().clearCookies();
    await page.goto(href!);
    await page
      .getByRole("textbox", { name: "Your email" })
      .fill("jorge@example.test");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(
      page.getByRole("textbox", { name: "The six digits we just emailed you" }),
    ).toBeVisible();
    await catalog.drainMail();
    const code = catalog.sender.sent.at(-1)!.subject.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeDefined();
    await page
      .getByRole("textbox", { name: "The six digits we just emailed you" })
      .fill(code!);
    await page.getByRole("button", { name: "Open the photos" }).click();
    await expect(page).toHaveURL(/complete-profile/);
    await page.getByRole("textbox", { name: "Your name" }).fill("Jorge");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(href!);
    const target = new URL(href!).searchParams.get("comment");
    await expect(page.locator(`[data-comment-id="${target}"]`)).toBeFocused();
    expect(
      await page.locator("video").evaluate((video: HTMLVideoElement) => {
        return {
          paused: video.paused,
          time: video.currentTime,
        };
      }),
    ).toEqual({ paused: true, time: 0 });
  } finally {
    await secure.close();
  }
});
