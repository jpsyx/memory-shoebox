import { test, expect } from "../../admin.fixtures.ts";
import {
  expectInsideTheater,
  moveTheater,
  openTheaterComments,
  pauseTheaterVideo,
  useWindowTheater,
} from "../../support/theaterTestHelpers.ts";

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
    if (kind === "video") {
      await pauseTheaterVideo(page, 0.4);
    }
    const mediaReaction = page.getByRole("button", {
      name: kind === "photo" ? "React: Love" : "React: Laugh",
      exact: true,
    });
    await mediaReaction.click();
    const field = await openTheaterComments(page);
    if (kind === "video") {
      await expect(
        page.getByRole("button", { name: /Comment at / }),
      ).toHaveCount(0);
    }
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
    if (kind === "photo") {
      await expect(mediaReaction).toHaveAttribute("aria-pressed", "true");
    } else {
      expect(
        await catalog.database
          .selectFrom("video_reactions")
          .select("id")
          .where("item_id", "=", itemId)
          .execute(),
      ).toHaveLength(1);
    }
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
    if (kind === "video") {
      expect(
        comments.find((comment) => {
          return comment.parent_comment_id !== null;
        })?.at_seconds,
      ).toBeNull();
    }
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
    // The authorized detail includes comments; an empty loading shell proves nothing.
    await expect(
      page.getByRole("textbox", { name: "Write a comment" }),
    ).toBeEditable();
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
