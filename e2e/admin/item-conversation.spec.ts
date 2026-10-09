import { insertBurst } from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { insertUploadSession } from "../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import { test, expect } from "./admin.fixtures.ts";

[
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`photo conversation and More drawer work at ${viewport.width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
    const photo = page.getByRole("img", { name: "A family memory" });
    await expect(photo).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download the original" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "React: Love", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "React: Love", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Comment on this photo" }).click();
    const field = page.getByRole("textbox", { name: "Write a comment" });
    await expect(field).toBeFocused();
    await field.fill("A lovely photo.");
    await field.press("Control+Enter");
    await expect(
      page.getByText("A lovely photo.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("A lovely photo.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "React: Love", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const comment = page.getByRole("article");
    await comment.getByRole("button", { name: "React with Love" }).click();
    await expect(
      comment.getByRole("button", { name: "Remove Love reaction" }),
    ).toBeVisible();
    const more = page.getByRole("button", { name: "More photo details" });
    await more.click();
    const drawer = page.getByRole("dialog", { name: "Photo details" });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: "Download the original" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(photo).toBeVisible();
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollWidth <= innerWidth;
      }),
    ).toBe(true);
    const saved = await catalog.database
      .selectFrom("comments")
      .select("at_seconds")
      .where("item_id", "=", catalog.itemId)
      .executeTakeFirstOrThrow();
    expect(saved.at_seconds).toBeNull();
    expect(
      await catalog.database
        .selectFrom("video_reactions")
        .selectAll()
        .where("item_id", "=", catalog.itemId)
        .execute(),
    ).toHaveLength(0);
  });
});

[
  { width: 1366, height: 768, minimumPhotoHeight: 537 },
  { width: 1280, height: 800, minimumPhotoHeight: 528 },
  { width: 1440, height: 900, minimumPhotoHeight: 630 },
].forEach(({ minimumPhotoHeight, ...viewport }) => {
  test(`photo fits ${viewport.width} by ${viewport.height} without reducing its image`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
    const photo = page.getByRole("img", { name: "A family memory" });
    await expect(photo).toBeVisible();
    await expect
      .poll(async () => {
        return photo.evaluate((image: HTMLImageElement) => {
          return image.complete && image.naturalWidth > 0;
        });
      })
      .toBe(true);
    await page
      .getByRole("button", { name: "React: Love", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "1 reaction. See who left it" }),
    ).toBeVisible();
    expect((await photo.boundingBox())!.height).toBeGreaterThanOrEqual(
      minimumPhotoHeight,
    );
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollHeight;
      }),
    ).toBeLessThanOrEqual(viewport.height);
    await expect(
      page.getByRole("button", { name: "Comment on this photo" }),
    ).toBeInViewport();
    const field = page.getByRole("textbox", { name: "Write a comment" });
    await field.fill("A memory worth keeping.\n".repeat(30));
    await field.press("Control+Enter");
    await expect(page.getByRole("article")).toHaveCount(1);
    const commentReaction = page
      .getByRole("article")
      .getByRole("button", { name: "React with Love" });
    await commentReaction.focus();
    await expect(commentReaction).toBeInViewport();
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollHeight;
      }),
    ).toBeLessThanOrEqual(viewport.height);
    expect((await photo.boundingBox())!.height).toBeGreaterThanOrEqual(
      minimumPhotoHeight,
    );
  });
});

test("burst navigation fits beside photo reactions without shrinking the photo", async ({
  page,
  catalog,
}) => {
  const upload = await insertUploadSession(catalog.database, {
    uploadedBy: catalog.admin.memberId,
  });
  const burstId = await insertBurst(catalog.database, {
    uploadSessionId: upload,
    capturedOn: "2026-09-27",
  });
  await catalog.database
    .updateTable("items")
    .set({ burst_id: burstId, burst_index: 1 })
    .where("id", "=", catalog.itemId)
    .execute();
  await catalog.database
    .updateTable("items")
    .set({ burst_id: burstId, burst_index: 2 })
    .where("id", "=", "00000000-0000-4000-8000-000000000010")
    .execute();
  await catalog.database
    .updateTable("bursts")
    .set({ cover_item_id: catalog.itemId })
    .where("id", "=", burstId)
    .execute();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.itemId}`);
  const photo = page.getByRole("img", { name: "A family memory" });
  await expect(photo).toBeVisible();
  await page.getByRole("button", { name: "React: Love", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1 reaction. See who left it" }),
  ).toBeVisible();
  const sibling = page.getByRole("link", { name: "Frame 2 of 2" });
  await expect(sibling).toBeInViewport();
  expect((await photo.boundingBox())!.height).toBeGreaterThanOrEqual(537);
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollHeight;
    }),
  ).toBeLessThanOrEqual(768);
  await page.getByRole("link", { name: "Frame 1 of 2" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(sibling).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/00000000-0000-4000-8000-000000000010$/);
  await expect(sibling).toBeFocused();
});
