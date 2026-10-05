import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { test, expect } from "./admin.fixtures.ts";
type MemberGroupCapture = {
  page: Page;
  state: string;
  width: number;
  scheme: "light" | "dark";
};
const DIRECTORY: string = ".playwright-mcp/step9-acceptance/live/final-admin";

async function _prepareMemberGroupCapture({
  page,
  state,
  width,
  scheme,
}: Readonly<MemberGroupCapture>): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({
    colorScheme: scheme,
    reducedMotion: "reduce",
  });
  await page.goto(
    `/api/evidence/session/admin?to=/${state === "members-pending" ? "members" : "groups"}`,
  );
  await page
    .getByRole("button", {
      name: state === "members-pending" ? "Invite somebody" : "New group",
      exact: true,
    })
    .click();
  if (state === "members-pending") {
    await page
      .getByLabel("Their email", { exact: true })
      .fill(`cousin-${width}-${scheme}@example.com`);
    await page.getByLabel("What to call them").fill("Abuelo Tomás");
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(
      page.getByRole("button", { name: "Send the invitation" }),
    ).toBeDisabled();
    await expect(page.getByText(/Invitation queued/)).toBeVisible();
    await expect(
      page.getByText("Refreshing your account…", { exact: true }),
    ).toHaveCount(0);
  }
}
async function _captureMemberGroupVisual(
  options: Readonly<MemberGroupCapture>,
): Promise<void> {
  const { page, state, width, scheme } = options;
  await _prepareMemberGroupCapture(options);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollWidth <= innerWidth;
    }),
  ).toBe(true);
  await page.screenshot({
    path: `${DIRECTORY}/${state}-${width}-${scheme === "light" ? "day" : "night"}.png`,
    fullPage: true,
  });
}
(["members-pending", "groups-create"] as const).forEach((state) => {
  test(`${state} has no horizontal overflow at all widths and schemes`, async ({
    page,
  }) => {
    await mkdir(DIRECTORY, { recursive: true });
    for (const width of [400, 768, 1280]) {
      for (const scheme of ["light", "dark"] as const) {
        await _captureMemberGroupVisual({ page, state, width, scheme });
      }
    }
  });
});
