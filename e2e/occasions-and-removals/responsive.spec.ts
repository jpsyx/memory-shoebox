import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import {
  getDocumentMetricsFromPage,
  getFontSizesFromLocators,
} from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { reachControlWithKeyboard } from "./support/occasionBrowserHelpers.ts";
import { VISUAL_STATES } from "./support/prototypeStateHelpers/prototypeStateHelpers.constants.ts";
import { showControlledVisualState } from "./support/prototypeStateHelpers/prototypeStateHelpers.ts";
Object.entries(VISUAL_STATES).forEach(([surface, states]) => {
  test(`controlled 640px equivalent reflow for all ${surface} states in both schemes`, async ({
    adminPage,
  }) => {
    test.setTimeout(60_000);
    for (const state of states) {
      for (const scheme of ["light", "dark"] as const) {
        await adminPage.setViewportSize({ width: 640, height: 900 });
        await showControlledVisualState({
          page: adminPage,
          surface,
          state,
          scheme,
          longText: true,
        });
        const metrics = await getDocumentMetricsFromPage(adminPage);
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        if (state === "fix") {
          const descriptions = adminPage.locator(
            '[class*="milestoneFixApproachDescription"]',
          );
          await expect(descriptions).toHaveCount(2);
          const fontSizes = await getFontSizesFromLocators(descriptions);
          fontSizes.forEach((fontSize) => {
            return expect(fontSize).toBeGreaterThanOrEqual(15);
          });
        }
        await adminPage.screenshot({
          path: `${ACCEPTANCE_DIRECTORY}/${surface}-${state}-640-${scheme}-reflow.png`,
          fullPage: true,
        });
      }
    }
  });
});

test("controlled failed thumbnail preserves owning keyboard focus and pressed selection", async ({
  adminPage,
}) => {
  await showControlledVisualState({
    page: adminPage,
    surface: "milestones",
    state: "created",
    scheme: "light",
  });
  let releaseImage: (() => void) | undefined;
  const heldImage = new Promise<void>((resolvePromise) => {
    releaseImage = resolvePromise;
  });
  await adminPage.route("**/media/web/highChair-thumb.jpg", async (route) => {
    await heldImage;
    await route.abort();
  });
  await adminPage.reload();
  const print = adminPage
    .getByRole("button", { name: "Family at home", exact: true })
    .first();
  await expect(print).toBeVisible();
  await reachControlWithKeyboard({ page: adminPage, control: print });
  await adminPage.keyboard.press("Enter");
  await expect(print).toHaveAttribute("aria-pressed", "true");
  releaseImage?.();
  const unavailable = adminPage
    .getByRole("button", {
      name: "Unavailable photograph: Family at home",
      exact: true,
    })
    .first();
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toHaveAttribute("aria-pressed", "true");
  await expect(unavailable.locator("img")).toHaveCount(0);
});

test("controlled 4000-character unbroken replies remain readable at every width", async ({
  adminPage,
}) => {
  test.setTimeout(60_000);
  for (const width of [1280, 768, 400, 640]) {
    for (const scheme of ["light", "dark"] as const) {
      await adminPage.setViewportSize({ width, height: 900 });
      await showControlledVisualState({
        page: adminPage,
        surface: "removal",
        state: "declined",
        scheme,
        longText: true,
      });
      await expect(
        adminPage.getByText("É".repeat(4000), { exact: true }),
      ).toBeVisible();
      const metrics = await getDocumentMetricsFromPage(adminPage);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      await adminPage.screenshot({
        path: `${ACCEPTANCE_DIRECTORY}/long-declined-${width}-${scheme}.png`,
        fullPage: true,
      });
    }
  }
});

test("controlled failed decline retains a 4000-character reply and readable controls at every width", async ({
  adminPage,
}) => {
  test.setTimeout(60_000);
  for (const width of [1280, 768, 400, 640]) {
    for (const scheme of ["light", "dark"] as const) {
      await adminPage.setViewportSize({ width, height: 900 });
      await showControlledVisualState({
        page: adminPage,
        surface: "removal-requests",
        state: "declining",
        scheme,
      });
      await adminPage.route(
        "**/api/removal-requests/*/decline",
        async (route) => {
          await route.fulfill({
            status: 503,
            json: { error: "unavailable", message: "Please retry later." },
          });
        },
      );
      const textbox = adminPage.getByRole("dialog").getByRole("textbox");
      await textbox.fill("Á".repeat(4000));
      await adminPage
        .getByRole("button", { name: "Send this and keep it" })
        .click();
      await expect(
        adminPage.getByRole("dialog").getByRole("alert"),
      ).toBeVisible();
      await expect(textbox).toHaveValue("Á".repeat(4000));
      const metrics = await getDocumentMetricsFromPage(adminPage);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      await adminPage.screenshot({
        path: `${ACCEPTANCE_DIRECTORY}/failed-decline-${width}-${scheme}.png`,
        fullPage: true,
      });
    }
  }
});

test("controlled queue failed thumbnail remains readable with live request controls", async ({
  adminPage,
}) => {
  await showControlledVisualState({
    page: adminPage,
    surface: "removal-requests",
    state: "open",
    scheme: "light",
  });
  await adminPage.route("**/media/web/highChair-thumb.jpg", async (route) => {
    await route.abort();
  });
  await adminPage.reload();
  const card = adminPage.getByRole("region", {
    name: "Request from Prima Inés",
  });
  await expect(card.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  await expect(
    card.getByRole("link", { name: "Open the photograph" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Keep it, and say why" }),
  ).toBeVisible();
  await adminPage.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/queue-failed-thumbnail.png`,
    fullPage: true,
  });
});
