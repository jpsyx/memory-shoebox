import type { Locator, Page } from "@playwright/test";
import { seedArchiveIntoE2eCatalog } from "./support/archive.ts";
import { seedMemberAtAddress } from "./support/database.ts";
import { ADMIN_EMAIL, expect, test, VIEWER_EMAIL } from "./support/signedIn.ts";

/**
 * Surface 6 against the seeded archive.
 *
 * Chip names come from the seed's vocabulary (`hospital`, `cake`, `beach`,
 * `first steps`, `the garden`) and its people (`Mateo`, `Abuela Rosa`, `Papá`,
 * `Sofía`). Every chip carries its own narrowed count beside the name, so the
 * locators below match on the name and never on the whole label.
 *
 * **Every chip is reached through the sheet and never through the page.** A
 * print's alt text is generated from who is in it, so `Abuela Rosa` names one
 * chip and thirteen photographs of her, and a page-wide locator is a strict
 * mode violation rather than a filter being pressed.
 */

/** The filter sheet, which is a `section` carrying its own accessible name. */
function _sheet(page: Page): Locator {
  return page.getByRole("region", { name: "Find something" });
}

test.beforeAll(async () => {
  const uploader = await seedMemberAtAddress({
    email: ADMIN_EMAIL,
    role: "admin",
  });
  const viewer = await seedMemberAtAddress({
    email: VIEWER_EMAIL,
    role: "viewer",
  });
  await seedArchiveIntoE2eCatalog({
    uploaderMemberId: uploader.memberId,
    viewerMemberId: viewer.memberId,
  });
});

test.describe("filter and search", () => {
  test("opens on the whole archive rather than an empty results page", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?find=true");
    await expect(adminPage.getByText("Find something")).toBeVisible();
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
  });

  test("puts a pressed chip in the URL, because a filter is an address", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?find=true");
    await _sheet(adminPage)
      .getByRole("button", { name: /hospital/ })
      .click();
    await expect(adminPage).toHaveURL(/tag=/);
  });

  test("draws the strip, and the strip carries a way out of each filter", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?find=true");
    await _sheet(adminPage)
      .getByRole("button", { name: /hospital/ })
      .click();
    await expect(
      adminPage.getByRole("button", { name: "Clear, show everything" }),
    ).toBeVisible();
    await adminPage
      .getByRole("button", { name: /Stop filtering by hospital/ })
      .click();
    await expect(adminPage).not.toHaveURL(/tag=/);
  });

  test("clears back to the whole pile", async ({ adminPage }) => {
    await adminPage.goto("/?find=true");
    await _sheet(adminPage)
      .getByRole("button", { name: /hospital/ })
      .click();
    await adminPage
      .getByRole("button", { name: "Clear, show everything" })
      .click();
    await expect(
      adminPage.getByRole("button", { name: "Clear, show everything" }),
    ).toHaveCount(0);
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
  });

  test("reads the day spine with the person's own name, never a pronoun", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?find=true");
    await _sheet(adminPage)
      .getByRole("button", { name: /Abuela Rosa/ })
      .click();
    await expect(adminPage.getByText("with Abuela Rosa").first()).toBeVisible();
    await expect(
      adminPage.getByText(/with her|with him|with them/),
    ).toHaveCount(0);
  });

  test("keeps a zero chip on the row, quiet and still announced", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/?find=true");
    // `the garden` tags only items restricted from this viewer, so it is worth
    // nothing to them and must still be on the row.
    const chip = _sheet(viewerPage).getByRole("button", { name: /the garden/ });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("aria-disabled", "true");
  });

  test("says which filter is excluding, and offers to drop it", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/?find=true");
    const sheet = _sheet(viewerPage);

    // A tag, then a stretch of time it has nothing in, rather than a second
    // tag. Two tags that exclude each other cannot be pressed in sequence,
    // and that is the row working as designed: the moment `beach` is on, the
    // `cake` chip narrows to nought and goes quiet, which is
    // `aria-disabled="true"` and therefore not something a driver will press.
    // Every one of the seed's beach photographs was taken in September.
    await sheet.getByRole("button", { name: /beach/ }).click();
    await sheet.getByLabel("From").fill("2026-07-01");
    await sheet.getByLabel("Until").fill("2026-07-31");

    await expect(viewerPage.getByText(/Nothing matches/)).toBeVisible();
    await expect(
      viewerPage.getByRole("button", { name: /^Drop / }).first(),
    ).toBeVisible();
  });

  test("narrows by a date range and keeps a milestone-only day inside it", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?from=2026-09-14&until=2026-09-16");
    await expect(
      adminPage.getByText(/Nothing is attached to this one yet/),
    ).toBeVisible();
  });
});
