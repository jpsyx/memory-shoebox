import { test, expect } from "./admin.fixtures.ts";

[1280, 390].forEach((width) => {
  test(`timeline previews show comments and reactions at ${width}px`, async ({
    page,
    catalog,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
    );
    const body = "That little wave at the camera!\nA moment to remember.";
    const comment = await page.request.post(
      `/api/items/${catalog.videoId}/comments`,
      {
        data: { body, atSeconds: 4 },
      },
    );
    expect(comment.ok()).toBe(true);
    const reactionId = crypto.randomUUID();
    const reaction = await page.request.put(
      `/api/items/${catalog.videoId}/video-reactions/${reactionId}`,
      {
        data: { emoji: "😮", atSeconds: 8 },
      },
    );
    expect(reaction.ok()).toBe(true);
    await page.reload();
    const commentMarker = page.getByRole("button", { name: /^Seek to 0:04:/ });
    await commentMarker.click();
    const preview = page.getByRole("list", { name: "Moments near 0:04" });
    await expect(preview.getByText(body)).toBeVisible();
    await expect(preview.locator("..")).toHaveCSS("opacity", "1");
    await page.screenshot({
      scale: "css",
      path: `.playwright-mcp/video-comment-${width}-${browserName}.png`,
    });
    const bounds = await preview.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
    await expect(commentMarker).toBeFocused();
    await commentMarker.press("Enter");
    await expect(preview).toBeVisible();
    await page.getByRole("heading", { name: /^Comments/ }).click();
    await expect(preview).toBeHidden();
    const reactionMarker = page
      .getByRole("button", {
        name: /^Seek to 0:08: .*reacted 😮/,
      })
      .and(page.locator('[aria-haspopup="dialog"]'));
    await expect(reactionMarker).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await reactionMarker.click();
    const reactions = page.getByRole("list", { name: "Moments near 0:08" });
    await expect(reactions.getByText("Reacted 😮")).toBeVisible();
    await expect(reactions.locator("..")).toHaveCSS("opacity", "1");
    await page.screenshot({
      scale: "css",
      path: `.playwright-mcp/video-reaction-${width}-${browserName}.png`,
    });
    await reactions
      .getByRole("button", { name: "Remove 😮 reaction at 0:08" })
      .click();
    await expect(reactionMarker).toBeHidden();
    await expect
      .poll(async () => {
        return catalog.database
          .selectFrom("video_reactions")
          .select("id")
          .where("id", "=", reactionId)
          .executeTakeFirst();
      })
      .toBeUndefined();
  });
});

test("long grouped comments remain readable across all renditions on a phone", async ({
  page,
  catalog,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  const body = "A family moment we will always remember.\n".repeat(25);
  for (const atSeconds of [0, 0.1]) {
    const comment = await page.request.post(
      `/api/items/${catalog.videoId}/comments`,
      {
        data: { body, atSeconds },
      },
    );
    expect(comment.ok()).toBe(true);
  }
  await page.reload();
  for (const rendition of ["day", "porcelain", "slate", "night"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.rendition = value;
    }, rendition);
    await page.getByRole("button", { name: "2 moments near 0:00" }).click();
    const moments = page.getByRole("list", { name: "Moments near 0:00" });
    await expect(moments).toBeVisible();
    await expect(moments.locator("..")).toHaveCSS("opacity", "1");
    const firstTimestamp = moments
      .getByRole("button", { name: /^Seek to/ })
      .first();
    await expect(firstTimestamp).toHaveCSS("font-size", "15px");
    await expect(firstTimestamp).toHaveCSS("font-weight", "600");
    expect(
      await moments.evaluate((element) => {
        return element.scrollHeight > element.clientHeight;
      }),
    ).toBe(true);
    const bounds = await moments.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
    await moments
      .getByRole("button", { name: /^Seek to/ })
      .last()
      .click();
    await expect(moments).toBeHidden();
  }
});
