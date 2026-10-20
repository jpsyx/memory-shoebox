import { test, expect } from "../../admin.fixtures.ts";
import {
  expectReachable,
  moveTheater,
  openTheaterComments,
  pauseTheaterVideo,
  useWindowTheater,
  waitForTheaterMorph,
} from "../../support/theaterTestHelpers.ts";

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
