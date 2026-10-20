import { expect, test } from "@playwright/test";
import { createTheaterCommentDockFocusServer } from "../../apps/web/test/createTheaterCommentDockFocusServer.ts";

type FocusServer = Awaited<
  ReturnType<typeof createTheaterCommentDockFocusServer>
>;
let server: FocusServer;

test.beforeAll(async () => {
  server = await createTheaterCommentDockFocusServer();
  await server.listen();
});
test.afterAll(async () => {
  await server?.close();
});
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${server.resolvedUrls!.local[0]}__theater-comment-focus`);
});

(["hover", "keyboard"] as const).forEach((activation) => {
  test(`${activation} opening focuses the real composer and captures its moment under animated CSS`, async ({
    page,
  }) => {
    const bubble = page.getByRole("button", {
      name: "Open comments, 0 comments",
    });
    if (activation === "hover") {
      await bubble.hover();
    } else {
      await bubble.focus();
      await page.keyboard.press("ArrowUp");
    }
    await expect(
      page.getByRole("textbox", { name: "Write a comment" }),
    ).toBeFocused({ timeout: 1500 });
    await expect(
      page.getByRole("button", {
        name: "Comment at 0:06; switch to whole video",
      }),
    ).toBeVisible();
  });
});

(["Escape", "navigation"] as const).forEach((closing) => {
  test(`${closing} restores bubble focus while animated CSS collapses the panel`, async ({
    page,
  }) => {
    const bubble = page.getByRole("button", {
      name: "Open comments, 0 comments",
    });
    await bubble.focus();
    await page.keyboard.press("ArrowUp");
    const field = page.getByRole("textbox", { name: "Write a comment" });
    await expect(field).toBeVisible();
    // Focus after visibility settles to isolate restoration from opening.
    await field.focus();
    if (closing === "Escape") {
      await field.press("Escape");
    } else {
      // Model a new item prop without moving focus out of the old field first.
      await page
        .getByRole("button", { name: "Next item" })
        .dispatchEvent("click");
    }
    await expect(bubble).toBeFocused({ timeout: 1500 });
  });
});
