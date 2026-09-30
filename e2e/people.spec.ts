import { seedArchiveForSpec } from "./support/archive.ts";
import { expect, test } from "./support/signedIn.ts";

/** Surface 7 against the seeded archive's four people, one of them unseen. */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test.describe("the people directory", () => {
  test("lists everybody tagged in the archive", async ({ adminPage }) => {
    await adminPage.goto("/people");
    await expect(adminPage.getByText("4 people")).toBeVisible();
    // Four independent checks on one static page: `.forEach` cannot be
    // awaited, so `.map` collects each assertion's promise and `Promise.all`
    // runs them concurrently, still failing the test if any name is missing.
    await Promise.all(
      ["Mateo", "Abuela Rosa", "Papá", "Sofía"].map((name) => {
        return expect(adminPage.getByText(name, { exact: true })).toBeVisible();
      }),
    );
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
