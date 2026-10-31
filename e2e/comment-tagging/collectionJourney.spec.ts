import type { Page, Locator, Response } from "@playwright/test";
import {
  test,
  expect,
  signIn,
  selectTag,
  submitComment,
} from "./support/commentTaggingFixtures.ts";

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
    await _expectComposerInstruction(page, field);
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
    await _expectSavedSelectedTag(
      page,
      await submitComment(page, field),
      catalog.members.Jorge.memberId,
      "Remember this @Jorge ",
      14,
    );
  });
});

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
  await _expectSavedSelectedTag(
    page,
    await submitComment(page, field),
    catalog.members.Jorge.memberId,
    "Newer words @Jorge ",
    12,
  );
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

async function _expectSavedSelectedTag(
  page: Page,
  response: Response,
  memberId: string,
  body: string,
  start: number,
): Promise<void> {
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    body,
    commentTags: [{ memberId, start, end: start + 6 }],
  });
  const result = await response.json();
  const article = page.locator(`[data-comment-id="${result.commentId}"]`);
  await expect(article).toContainText(body.trim());
  await expect(
    article.getByRole("link", {
      name: "Jorge, view photos and videos",
      exact: true,
    }),
  ).toHaveAttribute("href", `/?member=${memberId}`);
}

async function _expectComposerInstruction(
  page: Page,
  field: Locator,
): Promise<void> {
  await _expectComposerMetrics(field);
  await field.fill("Typography sample");
  const originalViewport = page.viewportSize()!;
  const viewports =
    originalViewport.width < 800
      ? [
          { width: 390, height: 844 },
          { width: 844, height: 390 },
        ]
      : [originalViewport];
  await viewports.reduce(async (previous, viewport) => {
    await previous;
    await page.setViewportSize(viewport);
    await _expectComposerMetrics(field);
  }, Promise.resolve());
  const rendition = await page.locator("html").getAttribute("data-rendition");
  await page.evaluate(() => {
    document.documentElement.dataset.rendition = "slate";
  });
  await _expectComposerMetrics(field);
  await page.evaluate((value) => {
    if (value) {
      document.documentElement.dataset.rendition = value;
    } else {
      delete document.documentElement.dataset.rendition;
    }
  }, rendition);
  await page.setViewportSize(originalViewport);
}

async function _expectComposerMetrics(field: Locator): Promise<void> {
  const hint = field
    .locator("..")
    .locator("..")
    .getByText("Type @ to tag a member.", { exact: true });
  const metrics = await field.evaluate((element) => {
    return {
      font: parseFloat(getComputedStyle(element).fontSize),
      lineHeight: getComputedStyle(element).lineHeight,
      phone: matchMedia("(max-width: 800px), (pointer: coarse)").matches,
    };
  });
  if (metrics.phone) {
    expect.soft(metrics.font).toBeGreaterThanOrEqual(16);
  }
  await expect
    .poll(async () => {
      return field.evaluate((element) => {
        const style = getComputedStyle(element.previousElementSibling!);
        return {
          font: parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
        };
      });
    })
    .toEqual({ font: metrics.font, lineHeight: metrics.lineHeight });
  await expect.soft(hint).toBeVisible();
  await _expectHintBelowInput(hint);
}

async function _expectHintBelowInput(hint: Locator): Promise<void> {
  if (await hint.count()) {
    const help = await hint.evaluate((element) => {
      const input = element.parentElement!.querySelector("textarea")!;
      return {
        font: parseFloat(getComputedStyle(element).fontSize),
        top: element.getBoundingClientRect().top,
        fieldBottom: input.getBoundingClientRect().bottom,
      };
    });
    expect(help.font).toBeGreaterThanOrEqual(15);
    expect(help.top).toBeGreaterThanOrEqual(help.fieldBottom);
  }
}
