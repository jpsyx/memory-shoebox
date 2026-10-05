import { seedArchiveForSpec } from "../support/archive.ts";
import { openFirstPhotographOn } from "../support/itemHelpers.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * The uploader's half of surface 3: tagging, who can see it, the capture
 * date and the delete, each through the real routes.
 *
 * 23 September holds one photograph (`archivePlan.ts`, "alone-1"), so `?at=`
 * puts it first on the page.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("tags it, and the tag is a way into the pile", async ({ adminPage }) => {
  await openFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });

  await adminPage.getByRole("button", { name: "+ Add a tag" }).click();
  const field = adminPage.getByRole("combobox", { name: "Tags" });
  await field.fill("garden party");
  await field.press("Enter");
  await adminPage.getByRole("button", { name: "Done" }).click();

  await expect(
    adminPage.getByRole("link", { name: "garden party" }),
  ).toHaveAttribute("href", /^\/\?tag=[0-9a-f-]+$/u);
});

test("changes who can see it, and changes it back", async ({ adminPage }) => {
  await openFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });
  // The shared admin answers to whatever the run last called it, which is
  // "abuela" until `account.keyboard.spec.ts` renames it, so its name is read
  // off the page: the admin uploaded every seeded item, so the uploader named
  // under the frame is the viewer the picker always offers.
  const uploadedBy = await adminPage.getByText(/^Uploaded by /u).textContent();
  const viewerName = (uploadedBy ?? "").replace(/^Uploaded by /u, "");

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  // Real admin-directory options include the role in their accessible name.
  await adminPage
    .getByRole("option", { name: `${viewerName} Admin`, exact: true })
    .click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(
    sheet.getByRole("button", { name: "Change who can see it" }),
  ).toBeVisible();
  await expect(sheet.getByText("Everyone", { exact: true })).toHaveCount(0);
  await expect(
    sheet.getByText(/^To everyone else this photograph is not there at all/u),
  ).toBeVisible();

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Everyone", { exact: true }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Everyone", { exact: true })).toBeVisible();
});

test.fixme("offers the Shoebox's other members to choose from", async ({
  adminPage,
}) => {
  // Turn this on once `GET /api/members` and `GET /api/groups` exist; for
  // now they answer `404`. `apps/web/src/api/members` and `api/groups` are
  // already written against `administration.md`.
  await openFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });
  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await expect(
    adminPage.getByRole("option", { name: /prima/iu }),
  ).toBeVisible();
});

test("deletes it, and it is not there afterwards", async ({ adminPage }) => {
  await openFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-10",
  });
  const itemUrl = adminPage.url();

  await adminPage
    .getByRole("button", { name: "Delete this photograph" })
    .click();
  await adminPage
    .getByRole("dialog", { name: "Delete this photograph?" })
    .getByRole("button", { name: "Delete it" })
    .click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-10$/u);

  await adminPage.goto(itemUrl);
  await expect(
    adminPage.getByRole("heading", { level: 1, name: "This one is not here." }),
  ).toBeVisible();
});

test("puts the date right, and the way back names the new day", async ({
  adminPage,
}) => {
  await openFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "When this was taken" });

  await sheet.getByRole("button", { name: "Put the date right" }).click();
  await sheet.getByLabel("The day it was taken").click();
  await adminPage.getByRole("button", { name: "22 September 2026" }).click();
  await sheet.getByRole("button", { name: "Put it right" }).click();

  await expect(sheet.getByText(/^22 September 2026, /u)).toBeVisible();
  await expect(
    adminPage.getByRole("link", { name: "Back to 22 September" }),
  ).toBeVisible();
});
