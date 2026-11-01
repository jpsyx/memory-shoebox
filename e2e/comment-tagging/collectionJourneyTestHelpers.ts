import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "./support/commentTaggingFixtures.ts";

/** Shared expect saved selected tag for focused local regression scenarios. */
export async function expectSavedSelectedTag(
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

/**
 * Shared expect composer instruction for focused local regression scenarios.
 */
export async function expectComposerInstruction(
  page: Page,
  field: Locator,
): Promise<void> {
  await expectComposerMetrics(field);
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
    await expectComposerMetrics(field);
  }, Promise.resolve());
  const rendition = await page.locator("html").getAttribute("data-rendition");
  await page.evaluate(() => {
    document.documentElement.dataset.rendition = "slate";
  });
  await expectComposerMetrics(field);
  await page.evaluate((value) => {
    if (value) {
      document.documentElement.dataset.rendition = value;
    } else {
      delete document.documentElement.dataset.rendition;
    }
  }, rendition);
  await page.setViewportSize(originalViewport);
}

async function expectComposerMetrics(field: Locator): Promise<void> {
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
  await expectHintBelowInput(hint);
}

async function expectHintBelowInput(hint: Locator): Promise<void> {
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
