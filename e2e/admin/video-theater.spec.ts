import { test, expect } from "./admin.fixtures.ts";
import {
  expectInsideTheater,
  expectReachable,
  moveTheater,
  openTheaterComments,
  pauseTheaterVideo,
  useWindowTheater,
  waitForTheaterMorph,
} from "./support/theaterTestHelpers.ts";

for (const mode of ["native", "window"] as const) {
  test(`${mode} host survives mixed navigation, mode changes and current-item Back`, async ({
    page,
    catalog,
  }, testInfo) => {
    if (mode === "window") await useWindowTheater(page);
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
      .getByRole("button", { name: "Enter theater", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Media theater" }),
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
    if (mode === "window") expect(hasNative).toBe(false);
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
        .getByRole("button", { name: "Leave fullscreen", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Enter fullscreen", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Enter fullscreen", exact: true })
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
      page.getByRole("button", { name: "Enter theater", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
    expect(
      await video!.evaluate((element: HTMLVideoElement) => {
        return element.isConnected && element.paused;
      }),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Enter theater", exact: true })
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
    if (hasNative)
      expect(
        await originalHost!.evaluate((element) => {
          return element === document.fullscreenElement;
        }),
      ).toBe(true);
  });
}

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
      .getByRole("button", { name: "Enter theater", exact: true })
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

for (const kind of ["photo", "video"] as const) {
  test(`${kind} theater persists shared posts, edits, reactions and permission-aware deletion`, async ({
    page,
    catalog,
  }) => {
    await useWindowTheater(page);
    const itemId = kind === "photo" ? catalog.itemId : catalog.videoId;
    await page.goto(`/api/evidence/session/viewer?to=/items/${itemId}`);
    await page
      .getByRole("button", { name: "Enter theater", exact: true })
      .click();
    if (kind === "video") await pauseTheaterVideo(page, 0.4);
    const mediaReaction = page.getByRole("button", {
      name: kind === "photo" ? "React: Love" : "React: Laugh",
      exact: true,
    });
    await mediaReaction.click();
    const field = await openTheaterComments(page);
    if (kind === "video")
      await expect(
        page.getByRole("button", { name: /Comment at / }),
      ).toHaveCount(0);
    await field.fill(`Shared ${kind} memory`);
    await field.press("ControlOrMeta+Enter");
    let article = page
      .getByRole("article")
      .filter({ hasText: `Shared ${kind} memory` });
    await expect(article).toBeVisible();
    await article.getByRole("button", { name: "React with Love" }).click();
    await expect(
      article.getByRole("button", { name: "Remove Love reaction" }),
    ).toBeVisible();
    if (kind === "video") {
      await article.getByRole("button", { name: /^Reply to / }).click();
      await page
        .getByRole("textbox", { name: /^Reply to / })
        .fill("An inherited reply");
      await page
        .getByRole("button", { name: "Post reply", exact: true })
        .click();
      await expect(
        page.getByText("An inherited reply", { exact: true }),
      ).toBeVisible();
    }
    await article.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("textbox", { name: "What you wrote" })
      .fill(`Edited ${kind} memory`);
    await page
      .getByRole("button", { name: "Save the change", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Enter theater", exact: true })
      .click();
    await openTheaterComments(page);
    if (kind === "photo")
      await expect(mediaReaction).toHaveAttribute("aria-pressed", "true");
    else
      expect(
        await catalog.database
          .selectFrom("video_reactions")
          .select("id")
          .where("item_id", "=", itemId)
          .execute(),
      ).toHaveLength(1);
    article = page
      .getByRole("article")
      .filter({ hasText: `Edited ${kind} memory` });
    await expect(
      article.getByRole("button", { name: "Remove Love reaction" }),
    ).toBeVisible();
    const comments = await catalog.database
      .selectFrom("comments")
      .selectAll()
      .where("item_id", "=", itemId)
      .execute();
    expect(comments[0]!.at_seconds).toBeNull();
    if (kind === "video")
      expect(
        comments.find((comment) => {
          return comment.parent_comment_id !== null;
        })?.at_seconds,
      ).toBeNull();
    await article.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Delete what you wrote?",
      exact: true,
    });
    await expectInsideTheater(dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(field).toBeVisible();
    await article.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Delete it", exact: true })
      .click();
    await expect(article).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(`Edited ${kind} memory`)).toHaveCount(0);
  });
}

test("late successful real post preserves a newer draft across mixed navigation", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((release) => {
    releaseResponse = release;
  });
  await page.route(
    `**/api/items/${catalog.videoId}/comments`,
    async (route) => {
      const response = await route.fetch();
      await responseGate;
      await route.fulfill({ response });
    },
  );
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await pauseTheaterVideo(page, 4);
  const field = await openTheaterComments(page);
  await field.fill("Slow persisted post");
  await field.press("ControlOrMeta+Enter");
  await expect
    .poll(() => {
      return catalog.database
        .selectFrom("comments")
        .select("id")
        .where("item_id", "=", catalog.videoId)
        .execute();
    })
    .toHaveLength(1);
  await field.fill("A newer video draft");
  await field.press("ControlOrMeta+Enter");
  await moveTheater(page, "Next");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
  await (await openTheaterComments(page)).fill("Photo draft stays");
  releaseResponse();
  await moveTheater(page, "Previous");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await openTheaterComments(page);
  await expect(field).toHaveValue("A newer video draft");
  await expect(
    page.getByText("Slow persisted post", { exact: true }),
  ).toBeVisible();
  expect(
    await catalog.database
      .selectFrom("comments")
      .select("id")
      .where("item_id", "=", catalog.videoId)
      .execute(),
  ).toHaveLength(1);
  await moveTheater(page, "Next");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
  await expect(await openTheaterComments(page)).toHaveValue(
    "Photo draft stays",
  );
});

test("failed post retains anchor and real retry; viewers cannot edit others, admins can delete", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  expect(
    (
      await page.request.post(`/api/items/${catalog.videoId}/comments`, {
        data: { body: "Admin words" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await pauseTheaterVideo(page, 3);
  const field = await openTheaterComments(page);
  const adminComment = page
    .getByRole("article")
    .filter({ hasText: "Admin words" });
  await expect(
    adminComment.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    adminComment.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await page.route(
    `**/api/items/${catalog.videoId}/comments`,
    (route) => {
      return route.fulfill({
        status: 500,
        json: { error: "internal", message: "Test failure" },
      });
    },
    { times: 1 },
  );
  await field.fill("Retry these words");
  await field.press("ControlOrMeta+Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue("Retry these words");
  await expect(
    page.getByRole("button", {
      name: "Comment at 0:03; switch to whole video",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Comment at 0:03; switch to whole video" })
    .click();
  await field.press("ControlOrMeta+Enter");
  await expect(
    page.getByText("Retry these words", { exact: true }),
  ).toBeVisible();
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await openTheaterComments(page);
  const viewerComment = page
    .getByRole("article")
    .filter({ hasText: "Retry these words" });
  await expect(
    viewerComment.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    viewerComment.getByRole("button", { name: "Delete", exact: true }),
  ).toBeVisible();
});

test("slow then denied actual detail keeps host and never exposes old conversation", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await (await openTheaterComments(page)).fill("Private previous draft");
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>((release) => {
    releaseDetail = release;
  });
  await page.route(`**/api/items/${catalog.itemId}`, async (route) => {
    await detailGate;
    await route.fulfill({
      status: 404,
      json: { error: "not_found", message: "Not found" },
    });
  });
  const host = await page.locator("[data-item-theater-host]").elementHandle();
  await moveTheater(page, "Next");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.itemId}$`));
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeVisible();
  releaseDetail();
  await expect(
    page.getByText("This one is not here.", { exact: true }),
  ).toBeVisible();
  expect(
    await host!.evaluate((element) => {
      return element.isConnected;
    }),
  ).toBe(true);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "A family memory" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Media theater" })).toHaveCount(
    0,
  );
});

test("window focus wraps, Escape layers, and teardown restores page ownership", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
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
  await expect(
    page.getByRole("dialog", { name: "Media theater" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Enter theater", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 390, height: 480 },
  { width: 844, height: 390 },
]) {
  test(`geometry and screenshot batch at ${viewport.width}x${viewport.height}`, async ({
    page,
    catalog,
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width === 390,
      isMobile: viewport.width === 390,
      baseURL: catalog.origin,
    });
    const visualPage = await context.newPage();
    void page;
    try {
      await useWindowTheater(visualPage);
      await visualPage.emulateMedia({ reducedMotion: "no-preference" });
      await visualPage.goto(
        `/api/evidence/session/admin?to=/items/${catalog.itemId}`,
      );
      await visualPage
        .getByRole("button", { name: "Enter theater", exact: true })
        .click();
      const title = visualPage
        .locator("[data-item-theater-host] [title]")
        .filter({ hasText: /September/ });
      await expect(title).toHaveCSS("height", "48px");
      await expect(title).toHaveCSS("border-radius", "12px");
      await expect(title).toHaveCSS("white-space", "nowrap");
      await expect(title).toHaveCSS("text-overflow", "ellipsis");
      await expect(
        visualPage.getByRole("button", { name: "Back", exact: true }),
      ).toHaveCSS("height", "48px");
      await expect(
        visualPage.getByText("Take your time", { exact: false }),
      ).toHaveCount(0);
      for (const kind of ["photo", "video"] as const) {
        if (kind === "video") {
          await moveTheater(visualPage, "Previous");
          await expect(visualPage).toHaveURL(
            new RegExp(`/items/${catalog.videoId}$`),
          );
          await pauseTheaterVideo(visualPage, 4);
        }
        if (viewport.width === 390) {
          const bubbleBounds = (await visualPage
            .getByRole("button", { name: /^Open comments,/ })
            .boundingBox())!;
          expect(
            viewport.height - bubbleBounds.y - bubbleBounds.height,
          ).toBeLessThanOrEqual(32);
        }
        await visualPage.screenshot({
          animations: "disabled",
          path: `.playwright-mcp/theater-production/${testInfo.project.name}-${viewport.width}x${viewport.height}-${kind}-closed.png`,
        });
        const field = await openTheaterComments(visualPage);
        await field.fill("A family moment to keep.");
        await waitForTheaterMorph(visualPage);
        const panelBounds = (await visualPage
          .locator("[data-theater-comment-panel]")
          .boundingBox())!;
        const reactionBounds = (await visualPage
          .getByRole("button", {
            name: kind === "video" ? "React: Laugh" : "React: Love",
            exact: true,
          })
          .boundingBox())!;
        if (viewport.width === 390) {
          expect(
            viewport.height - panelBounds.y - panelBounds.height,
          ).toBeLessThanOrEqual(32);
          if (kind === "video") {
            const controlsBounds = (await visualPage
              .getByRole("slider", { name: "Where in the video" })
              .locator("../..")
              .boundingBox())!;
            expect(
              controlsBounds.y + controlsBounds.height,
            ).toBeLessThanOrEqual(panelBounds.y - 8);
            expect(
              reactionBounds.y + reactionBounds.height,
            ).toBeLessThanOrEqual(controlsBounds.y - 8);
          } else
            expect(
              reactionBounds.y + reactionBounds.height,
            ).toBeLessThanOrEqual(panelBounds.y - 8);
        }
        if (kind === "video")
          await expect(
            visualPage.getByRole("button", { name: "Previous photo or video" }),
          ).toHaveCSS("border-top-width", "0px");
        if (kind === "video")
          expect(
            (await visualPage
              .getByRole("slider", { name: "Where in the video" })
              .locator("../..")
              .boundingBox())!.height,
          ).toBeLessThanOrEqual(90);
        const close = visualPage.getByRole("button", {
          name: "Close comments",
          exact: true,
        });
        await expectReachable(close);
        await expect(close.locator("svg")).toHaveCSS("visibility", "visible");
        await testInfo.attach(
          `close-${kind}-${viewport.width}x${viewport.height}`,
          {
            contentType: "application/json",
            body: JSON.stringify(
              await close.evaluate((element) => {
                const css = getComputedStyle(element);
                const icon = getComputedStyle(element.querySelector("svg")!);
                return {
                  bounds: element.getBoundingClientRect().toJSON(),
                  visibility: css.visibility,
                  opacity: css.opacity,
                  color: css.color,
                  iconVisibility: icon.visibility,
                  iconOpacity: icon.opacity,
                };
              }),
            ),
          },
        );
        await expectReachable(field);
        await expectReachable(
          visualPage.getByRole("button", { name: "Post comment", exact: true }),
        );
        await expectReachable(
          visualPage.getByRole("button", {
            name: kind === "video" ? "React: Laugh" : "React: Love",
            exact: true,
          }),
        );
        if (kind === "video") {
          await expectReachable(
            visualPage.getByRole("slider", { name: "Where in the video" }),
          );
          await expectReachable(
            visualPage.getByRole("combobox", { name: "Playback speed" }),
          );
        }
        await visualPage.screenshot({
          path: `.playwright-mcp/theater-production/${testInfo.project.name}-${viewport.width}x${viewport.height}-${kind}-comments.png`,
        });
        await field.press("Escape");
      }
      await visualPage.emulateMedia({ reducedMotion: "reduce" });
      await openTheaterComments(visualPage);
      expect(
        await visualPage
          .locator("[data-theater-comment-dock]")
          .evaluate((element) => {
            return Number.parseFloat(
              getComputedStyle(element).transitionDuration,
            );
          }),
      ).toBeLessThan(0.001);
      await visualPage.screenshot({
        path: `.playwright-mcp/theater-production/${testInfo.project.name}-${viewport.width}x${viewport.height}-reduced-motion.png`,
      });
    } finally {
      await context.close();
    }
  });
}

test("native host contains shared media picker, comment picker and delete dialog", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  expect(
    (
      await page.request.post(`/api/items/${catalog.videoId}/comments`, {
        data: { body: "Portal ownership" },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await page
    .getByRole("button", { name: "More reactions", exact: true })
    .click();
  const mediaPicker = page.getByRole("dialog", {
    name: "More reactions",
    exact: true,
  });
  await expectInsideTheater(mediaPicker);
  await mediaPicker
    .getByRole("button", { name: "React: Heart", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await openTheaterComments(page);
  const article = page
    .getByRole("article")
    .filter({ hasText: "Portal ownership" });
  const love = article.getByRole("button", { name: "React with Love" });
  await love.hover();
  const commentPicker = page.getByRole("dialog", { name: "Choose a reaction" });
  await expectInsideTheater(commentPicker);
  await commentPicker.getByRole("button", { name: "Wow", exact: true }).click();
  await article.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete what you wrote?",
    exact: true,
  });
  await expectInsideTheater(confirmation);
  await expectInsideTheater(
    confirmation.getByRole("button", { name: "Keep it", exact: true }),
  );
  await confirmation
    .getByRole("button", { name: "Keep it", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(article).toBeVisible();
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
      .getByRole("button", { name: "Enter theater", exact: true })
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
      name: exitDuringPending ? "Back" : "Enter fullscreen",
      exact: true,
    });
    await control.focus();
    await control.press("Enter");
    releaseDetail();
    if (exitDuringPending) {
      await expect(
        page.getByRole("button", { name: "Enter theater", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("dialog", { name: "Media theater" }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("img", { name: "A family memory" }),
      ).toBeVisible();
      await expect(control).toBeFocused();
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
    .getByRole("button", { name: "Enter theater", exact: true })
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
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "A family memory" }),
  ).toBeVisible();
  await expect(title).not.toContainText(/\d\/\d/);
});

test("actual detail retry retains host and grants no writes before authorization", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  const host = await page.locator("[data-item-theater-host]").elementHandle();
  await page.route(
    `**/api/items/${catalog.itemId}`,
    (route) => {
      return route.fulfill({
        status: 500,
        json: { error: "internal", message: "Detail unavailable" },
      });
    },
    { times: 2 },
  );
  await moveTheater(page, "Next");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "A family memory" }),
  ).toBeVisible();
  expect(
    await host!.evaluate((element) => {
      return element.isConnected;
    }),
  ).toBe(true);
  await expect(await openTheaterComments(page)).toBeEditable();
});

test("autoplay refusal leaves usable Play and controls keep their arrow keys", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.hasAttribute("data-refused-once")) {
        this.setAttribute("data-refused-once", "true");
        return Promise.reject(
          new DOMException("Autoplay refused", "NotAllowedError"),
        );
      }
      return originalPlay.call(this);
    };
  });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("video")).toHaveJSProperty("paused", false);
  await expect(
    page.getByRole("button", { name: "React: Laugh", exact: true }),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: "Where in the video" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await page.getByRole("combobox", { name: "Playback speed" }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await openTheaterComments(page);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
});

for (const fixture of [
  { name: "full-width", suffix: "000000000012", width: 960, height: 640 },
  { name: "tall", suffix: "000000000011", width: 640, height: 960 },
]) {
  test(`${fixture.name} photo remains contained with contrast at the edges`, async ({
    page,
    catalog,
  }, testInfo) => {
    await useWindowTheater(page);
    await page.setViewportSize({
      width: fixture.width,
      height: fixture.height,
    });
    await page.goto(
      `/api/evidence/session/admin?to=/items/00000000-0000-4000-8000-${fixture.suffix}`,
    );
    await page
      .getByRole("button", { name: "Enter theater", exact: true })
      .click();
    const photo = page.getByRole("img", { name: "A family memory" });
    await expect(photo).toHaveCSS("object-fit", "contain");
    await expect(photo).toHaveCSS("background-color", "rgb(0, 0, 0)");
    const arrow = page.getByRole("button", { name: "Next photo or video" });
    await page.mouse.move(fixture.width - 40, fixture.height / 2);
    await expect(arrow).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await arrow.focus();
    await expect(arrow).toHaveCSS("outline-style", "none");
    await expect(arrow.locator("svg")).toHaveCSS("outline-style", "solid");
    await expect(arrow.locator("svg")).toHaveCSS(
      "background-color",
      "rgba(23, 23, 23, 0.79)",
    );
    await page.screenshot({
      animations: "disabled",
      path: `.playwright-mcp/theater-production/${testInfo.project.name}-${fixture.name}.png`,
    });
    expect(catalog.origin).toContain("127.0.0.1");
  });
}

test("Back restores actual page scroll without refetching detail", async ({
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
    .getByRole("button", { name: "Enter theater", exact: true })
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
    page.getByRole("button", { name: "Enter theater", exact: true }),
  ).toBeFocused();
});

test("reduced-motion change permits immediate comment reopening after collapse", async ({
  page,
  catalog,
}) => {
  await useWindowTheater(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  const field = await openTheaterComments(page);
  await field.fill("Reopen the same composer");
  await field.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTheaterComments(page);
  await expect(field).toHaveValue("Reopen the same composer");
});
