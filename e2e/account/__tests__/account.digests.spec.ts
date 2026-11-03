import { expect, test } from "../../support/signedIn/signedIn.ts";
import { writeAndWaitForTheAnswer } from "../accountTestHelpers.ts";

test("daily digest settings work on phones and keep tag-link focus", async ({
  adminPage: page,
}, testInfo) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/account?email=comment-tag");
    const tags = page.getByRole("combobox", { name: "Comment tags" });
    await expect(tags).toBeFocused();
    await expect(page.getByRole("combobox")).toHaveCount(3);
    await expect(tags.locator("option")).toHaveText([
      "Off",
      "Immediate",
      "Daily digest",
    ]);
    await expect(page.getByText(/around 9/)).toBeVisible();
    await writeAndWaitForTheAnswer({
      page,
      write: async () => {
        await tags.selectOption("daily");
      },
    });
    await page.reload();
    await expect(tags).toHaveValue("daily");
    expect(
      await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        );
      }),
    ).toBeLessThanOrEqual(0);
    await tags.scrollIntoViewIfNeeded();
    await page.getByRole("region", { name: "Email", exact: true }).screenshot({
      path: testInfo.outputPath(`digest-settings-${width}.png`),
    });
    await writeAndWaitForTheAnswer({
      page,
      write: async () => {
        await tags.selectOption("immediate");
      },
    });
  }
});
