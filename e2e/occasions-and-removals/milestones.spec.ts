import { test, expect } from "./asking-occasions.fixtures.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
import { makeOccasionFromBrowser } from "./support/occasionBrowserHelpers.ts";

/** Exercise the calendar through a date well outside the fixture month. */
test.beforeEach(async ({ uploaderPage }) => {
  await uploaderPage.clock.setFixedTime(new Date("2027-04-05T12:00:00.000Z"));
});

test("live one-day saved empty occasion survives Cancel, attaches candidates and label deletion preserves media", async ({
  uploaderPage,
}) => {
  const label = "Occasion live single-day";
  const { itemId } = await seedAskingAndOccasions({
    label,
    capturedOn: "2026-10-17",
  });
  const milestoneId = await makeOccasionFromBrowser({
    page: uploaderPage,
    name: label,
  });
  await uploaderPage
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await uploaderPage
    .getByRole("button", { name: `View ${label}`, exact: true })
    .click();
  await expect(
    uploaderPage.getByText(/Nothing is attached/i).first(),
  ).toBeVisible();
  await uploaderPage.goto(`/milestones?milestone=${milestoneId}&mode=created`);
  const print = uploaderPage.getByRole("button", { name: label, exact: true });
  await expect(print).toHaveAttribute("aria-pressed", "false");
  await print.click();
  await expect(print).toHaveAttribute("aria-pressed", "true");
  await uploaderPage.getByRole("button", { name: "Save photographs" }).click();
  await expect(uploaderPage.getByText("1 attached; 0 detached.")).toBeVisible();
  await uploaderPage.goto(`/milestones?milestone=${milestoneId}&mode=delete`);
  await uploaderPage
    .getByRole("dialog")
    .getByRole("button", { name: "Delete the milestone" })
    .click();
  await expect(uploaderPage).toHaveURL("http://localhost:8099/milestones");
  const response = await uploaderPage.request.get(`/api/items/${itemId}`);
  expect(response.status()).toBe(200);
  await uploaderPage.goto(`/items/${itemId}`);
  await expect
    .poll(() => {
      return uploaderPage
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => {
          return image.naturalWidth;
        });
    })
    .toBeGreaterThan(0);
});

test("live span picker narrows tag, person and dates, retains toggled delta across narrowing", async ({
  uploaderPage,
}) => {
  const label = "Occasion filter case";
  const { itemId, tagId, personId } = await seedAskingAndOccasions({
    label,
    capturedOn: "2026-10-17",
  });
  const milestoneId = await makeOccasionFromBrowser({
    page: uploaderPage,
    name: label,
    isSpan: true,
  });
  await uploaderPage.goto(`/milestones?milestone=${milestoneId}&mode=attach`);
  const print = uploaderPage.getByRole("button", { name: label, exact: true });
  await print.click();
  await uploaderPage.getByLabel("Words in a tag or a name").fill(label);
  await uploaderPage
    .getByRole("button", { name: new RegExp(`^${label} `) })
    .first()
    .click();
  await uploaderPage.getByLabel("Words in a tag or a name").fill("Inés");
  await uploaderPage
    .getByRole("button", { name: /Inés Álvarez/ })
    .first()
    .click();
  await uploaderPage.getByLabel("From", { exact: true }).fill("2026-10-17");
  await uploaderPage.getByLabel("Until", { exact: true }).fill("2026-10-17");
  await expect(print).toHaveAttribute("aria-pressed", "true");
  const timelineRead = uploaderPage.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/timeline" &&
      url.search.includes(tagId) &&
      url.search.includes(personId)
    );
  });
  await uploaderPage.getByLabel("Until", { exact: true }).fill("2026-10-18");
  expect((await timelineRead).status()).toBe(200);
  const savedResponse = uploaderPage.waitForResponse((response) => {
    return (
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/milestones/${milestoneId}/items`)
    );
  });
  await uploaderPage.getByRole("button", { name: "Save photographs" }).click();
  const saved = await savedResponse;
  expect(saved.request().postDataJSON()).toEqual({
    attach: [itemId],
    detach: [],
  });
  await expect(uploaderPage.getByText("1 attached; 0 detached.")).toBeVisible();
});

for (const mode of ["move", "acknowledge", "widen"] as const) {
  test(`live ${mode} preserves or changes actual capture day as chosen`, async ({
    uploaderPage,
  }) => {
    const label = `Occasion ${mode} case`;
    const { itemId } = await seedAskingAndOccasions({
      label,
      capturedOn: "2026-10-23",
    });
    const milestoneId = await makeOccasionFromBrowser({
      page: uploaderPage,
      name: label,
      isSpan: true,
    });
    // Owned initial attachment is setup, the date decision itself is a real routed UI mutation.
    expect(
      (
        await uploaderPage.request.patch(
          `/api/milestones/${milestoneId}/items`,
          { data: { attach: [itemId], detach: [] } },
        )
      ).status(),
    ).toBe(200);
    await uploaderPage.goto(`/milestones?milestone=${milestoneId}&mode=fix`);
    if (mode === "move") {
      await uploaderPage
        .getByLabel(`Which day ${itemId} belongs to`, { exact: true })
        .selectOption("2026-10-19");
      await uploaderPage
        .getByRole("button", { name: "Move the 1", exact: true })
        .click();
    } else if (mode === "acknowledge") {
      await uploaderPage
        .getByRole("button", { name: "Leave these 1 as they are" })
        .click();
    } else {
      await uploaderPage
        .getByRole("radio", { name: "Widen the occasion to cover them" })
        .check();
      await uploaderPage
        .getByRole("button", { name: "Widen the occasion", exact: true })
        .click();
    }
    await expect(
      uploaderPage
        .getByText(/No photographs need a date decision|0.*outside/)
        .first(),
    ).toBeVisible();
    const item = await (
      await uploaderPage.request.get(`/api/items/${itemId}`)
    ).json();
    expect(item.capturedOn).toBe(mode === "move" ? "2026-10-19" : "2026-10-23");
    const detail = await (
      await uploaderPage.request.get(`/api/milestones/${milestoneId}`)
    ).json();
    expect(detail.mismatchCount).toBe(0);
    expect(detail.milestone.endsOn).toBe(
      mode === "widen" ? "2026-10-23" : "2026-10-21",
    );
  });
}
