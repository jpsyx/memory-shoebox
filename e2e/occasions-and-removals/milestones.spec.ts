import type { Page, Response } from "@playwright/test";
import type { Action } from "../../apps/web/src/surfaces/Milestones/useMilestoneReconcile/ReconcileAction.ts";
import { ReconcileAction } from "../../apps/web/src/surfaces/Milestones/useMilestoneReconcile/ReconcileAction.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getImageWidthFromPage } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { makeOccasionFromBrowser } from "./support/occasionBrowserHelpers.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
function _waitForFilteredTimelineResponse({
  page,
  tagId,
  personId,
}: Readonly<{
  page: Page;
  tagId: string;
  personId: string;
}>): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/timeline" &&
      url.search.includes(tagId) &&
      url.search.includes(personId)
    );
  });
}
function _waitForAttachmentResponse({
  page,
  milestoneId,
}: Readonly<{ page: Page; milestoneId: string }>): Promise<Response> {
  return page.waitForResponse((response) => {
    return (
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/milestones/${milestoneId}/items`)
    );
  });
}
async function _applyReconciliationThroughBrowser({
  page,
  mode,
  itemId,
}: Readonly<{ page: Page; mode: Action; itemId: string }>): Promise<void> {
  if (mode === "move") {
    await page
      .getByLabel(`Which day ${itemId} belongs to`, { exact: true })
      .selectOption("2026-10-19");
    await page.getByRole("button", { name: "Move the 1", exact: true }).click();
  } else if (mode === "acknowledge") {
    await page
      .getByRole("button", { name: "Leave these 1 as they are" })
      .click();
  } else {
    await page
      .getByRole("radio", { name: "Widen the occasion to cover them" })
      .check();
    await page
      .getByRole("button", { name: "Widen the occasion", exact: true })
      .click();
  }
}
async function _narrowArchive({
  page,
  label,
}: Readonly<{ page: Readonly<Page>; label: string }>): Promise<void> {
  await page.getByLabel("Words in a tag or a name").fill(label);
  await page
    .getByRole("button", { name: new RegExp(`^${label} `) })
    .first()
    .click();
  await page.getByLabel("Words in a tag or a name").fill("Inés");
  await page
    .getByRole("button", { name: /Inés Álvarez/ })
    .first()
    .click();
  await page.getByLabel("From", { exact: true }).fill("2026-10-17");
  await page.getByLabel("Until", { exact: true }).fill("2026-10-17");
}
/** Exercise the calendar through a date well outside the fixture month. */
test.beforeEach(async ({ uploaderPage: page }) => {
  await page.clock.setFixedTime(new Date("2027-04-05T12:00:00.000Z"));
});

test("live one-day saved empty occasion survives Cancel, attaches candidates and label deletion preserves media", async ({
  uploaderPage: page,
}) => {
  const LABEL = "Occasion live single-day";
  const { itemId } = await seedAskingAndOccasions({
    label: LABEL,
    capturedOn: "2026-10-17",
  });
  const milestoneId = await makeOccasionFromBrowser({
    page: page,
    name: LABEL,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: `View ${LABEL}`, exact: true })
    .click();
  await expect(page.getByText(/Nothing is attached/i).first()).toBeVisible();
  await page.goto(`/milestones?milestone=${milestoneId}&mode=created`);
  const print = page.getByRole("button", { name: LABEL, exact: true });
  await expect(print).toHaveAttribute("aria-pressed", "false");
  await print.click();
  await expect(print).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save photographs" }).click();
  await expect(page.getByText("1 attached; 0 detached.")).toBeVisible();
  await page.goto(`/milestones?milestone=${milestoneId}&mode=delete`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete the milestone" })
    .click();
  await expect(page).toHaveURL("http://localhost:8099/milestones");
  const response = await page.request.get(`/api/items/${itemId}`);
  expect(response.status()).toBe(200);
  await page.goto(`/items/${itemId}`);
  await expect
    .poll(() => {
      return getImageWidthFromPage(page);
    })
    .toBeGreaterThan(0);
});

test("live span picker narrows tag, person and dates, retains toggled delta across narrowing", async ({
  uploaderPage: page,
}) => {
  const LABEL = "Occasion filter case";
  const { itemId, tagId, personId } = await seedAskingAndOccasions({
    label: LABEL,
    capturedOn: "2026-10-17",
  });
  const milestoneId = await makeOccasionFromBrowser({
    page: page,
    name: LABEL,
    isSpan: true,
  });
  await page.goto(`/milestones?milestone=${milestoneId}&mode=attach`);
  const print = page.getByRole("button", { name: LABEL, exact: true });
  await print.click();
  await _narrowArchive({ page, label: LABEL });
  await expect(print).toHaveAttribute("aria-pressed", "true");
  const timelineRead = _waitForFilteredTimelineResponse({
    page: page,
    tagId,
    personId,
  });
  await page.getByLabel("Until", { exact: true }).fill("2026-10-18");
  expect((await timelineRead).status()).toBe(200);
  const savedResponse = _waitForAttachmentResponse({
    page: page,
    milestoneId,
  });
  await page.getByRole("button", { name: "Save photographs" }).click();
  const saved = await savedResponse;
  expect(saved.request().postDataJSON()).toEqual({
    attach: [itemId],
    detach: [],
  });
  await expect(page.getByText("1 attached; 0 detached.")).toBeVisible();
});

ReconcileAction.values.forEach((mode) => {
  test(`live ${mode} preserves or changes actual capture day as chosen`, async ({
    uploaderPage: page,
  }) => {
    const label = `Occasion ${mode} case`;
    const { itemId } = await seedAskingAndOccasions({
      label,
      capturedOn: "2026-10-23",
    });
    const milestoneId = await makeOccasionFromBrowser({
      page: page,
      name: label,
      isSpan: true,
    });
    // Owned initial attachment is setup, the date decision itself is a real
    // routed UI mutation.
    expect(
      (
        await page.request.patch(`/api/milestones/${milestoneId}/items`, {
          data: { attach: [itemId], detach: [] },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/milestones?milestone=${milestoneId}&mode=fix`);
    await _applyReconciliationThroughBrowser({
      page: page,
      mode,
      itemId,
    });
    await expect(
      page.getByText(/No photographs need a date decision|0.*outside/).first(),
    ).toBeVisible();
    const item = await (await page.request.get(`/api/items/${itemId}`)).json();
    expect(item.capturedOn).toBe(mode === "move" ? "2026-10-19" : "2026-10-23");
    const detail = await (
      await page.request.get(`/api/milestones/${milestoneId}`)
    ).json();
    expect(detail.mismatchCount).toBe(0);
    expect(detail.milestone.endsOn).toBe(
      mode === "widen" ? "2026-10-23" : "2026-10-21",
    );
  });
});
