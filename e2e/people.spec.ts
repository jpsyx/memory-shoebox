import { seedArchiveIntoE2eCatalog } from "./support/archive.ts";
import { seedMemberAtAddress } from "./support/database.ts";
import { ADMIN_EMAIL, expect, test, VIEWER_EMAIL } from "./support/signedIn.ts";

/** Surface 7 against the seeded archive's four people, one of them unseen. */

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

test.describe("the people directory", () => {
  test("lists everybody tagged in the archive", async ({ adminPage }) => {
    await adminPage.goto("/people");
    await expect(adminPage.getByText("4 people")).toBeVisible();
    for (const name of ["Mateo", "Abuela Rosa", "Papá", "Sofía"]) {
      await expect(adminPage.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test("says `Nothing yet` for somebody never photographed", async ({
    adminPage,
  }) => {
    await adminPage.goto("/people");
    await expect(adminPage.getByText("Nothing yet")).toBeVisible();
  });

  test("says how much of the directory is hidden when it is narrowed", async ({
    adminPage,
  }) => {
    await adminPage.goto("/people?q=a");
    await expect(adminPage.getByText(/ of 4 people$/)).toBeVisible();
  });

  test("filters the pile rather than opening a page for a person", async ({
    adminPage,
  }) => {
    await adminPage.goto("/people");
    await adminPage.getByRole("link", { name: /Mateo/ }).click();
    await expect(adminPage).toHaveURL(/\/\?person=/);
    await expect(
      adminPage.getByRole("button", { name: "Clear, show everything" }),
    ).toBeVisible();
  });

  test("says nothing about who holds an account", async ({ adminPage }) => {
    await adminPage.goto("/people");
    await expect(adminPage.getByText("4 people")).toBeVisible();
    await expect(adminPage.getByText(/\bmember\b/i)).toHaveCount(0);
  });

  test("shows no horizontal scrollbar at 200% zoom", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 640, height: 720 });
    await adminPage.goto("/people");
    await expect(adminPage.getByText("4 people")).toBeVisible();
    const overflows = await adminPage.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(overflows).toBe(false);
  });
});
