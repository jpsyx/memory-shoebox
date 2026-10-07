import { countItemsInE2eCatalog } from "./support/archive.ts";
import { expect, test } from "./support/signedIn.ts";

/**
 * Surface 5, which needs an archive with nothing in it.
 *
 * There is one catalog and one server for a run, so this file has to see it
 * before anything seeds it. Files run alphabetically under one worker, which
 * puts `empty` before `filter`, `people`, `pile` and `scroll`; the first
 * assertion is what turns a change to that ordering into a named failure here.
 */
test.describe("the empty archive", () => {
  test("runs before anything has seeded the archive", async () => {
    expect(
      await countItemsInE2eCatalog(),
      "empty.spec.ts must run before the specs that seed the archive; files run alphabetically under one worker",
    ).toBe(0);
  });

  test("asks an admin to put it all up", async ({ adminPage }) => {
    await adminPage.goto("/");
    await expect(adminPage.getByText("Nothing on the door yet.")).toBeVisible();
    await expect(
      adminPage.getByRole("link", { name: /Upload media/ }),
    ).toBeVisible();
  });

  test("tells a viewer nothing is shared with them, and names nobody", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/");
    await expect(
      viewerPage.getByText("Nothing here for you yet."),
    ).toBeVisible();
    await expect(viewerPage.getByText("Papá")).toHaveCount(0);
  });

  test("offers guidance without prototype commentary", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/");
    await expect(
      viewerPage.getByText(/Ask whoever invited you about it/),
    ).toBeVisible();
    await expect(viewerPage.getByText(/looks exactly the same/)).toHaveCount(0);
  });
});
