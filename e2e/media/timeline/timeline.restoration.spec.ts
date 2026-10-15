import { expect, test } from "../media.fixtures.ts";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px jump and reverse`, () => {
    test.use({ viewport });
    test("keeps the jump boundary through forward eviction and reversal, then changes the effective filter", async ({
      page,
    }) => {
      test.setTimeout(60000);
      const responses: Array<{
        url: URL;
        days: string[];
        nextCursor: string | null;
        previousCursor: string | null;
      }> = [];
      page.on("response", async (response) => {
        if (
          new URL(response.url()).pathname !== "/api/timeline" ||
          !response.ok()
        ) {
          return;
        }
        const body = await response.json();
        responses.push({
          url: new URL(response.url()),
          days: body.days.map((day: { capturedOn: string }) => {
            return day.capturedOn;
          }),
          nextCursor: body.nextCursor,
          previousCursor: body.previousCursor,
        });
      });
      await page.goto("/api/media-evidence/session");
      await page.getByRole("combobox", { name: "Jump to" }).click();
      await page.getByRole("option", { name: /^20 sep / }).click();
      await expect(page).toHaveURL(/at=2026-09-20/);
      await expect(page.locator('[id="day-2026-09-20"]')).toBeAttached();
      for (
        let step = 0;
        step < 50 &&
        responses.filter((response) => {
          return response.url.searchParams.get("until") === "2026-09-20";
        }).length < 7;
        step++
      ) {
        const count = responses.length;
        await expect
          .poll(async () => {
            if (responses.length > count) {
              return responses.length;
            }
            await page.evaluate(() => {
              return scrollTo(0, document.documentElement.scrollHeight);
            });
            return responses.length;
          })
          .toBeGreaterThan(count);
        const response = responses.at(-1)!;
        await expect(
          page.locator(`[id="day-${response.days.at(-1)}"]`),
        ).toBeAttached();
      }
      const bounded = responses.filter((response) => {
        return response.url.searchParams.get("until") === "2026-09-20";
      });
      expect(bounded.length).toBeGreaterThanOrEqual(7);
      expect(
        bounded
          .flatMap((response) => {
            return response.days;
          })
          .every((day) => {
            return day <= "2026-09-20";
          }),
      ).toBe(true);
      const firstRetainedDay = await page
        .locator('[id^="day-"]')
        .first()
        .getAttribute("id");
      const firstPage = bounded.find((response) => {
        return response.days[0] === firstRetainedDay?.slice(4);
      });
      expect(firstPage).toBeDefined();
      const requested = firstPage!.previousCursor;
      expect(requested).toBeTruthy();
      const reverseRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === "/api/timeline" &&
          url.searchParams.get("cursor") === requested
        );
      });
      const reverse = page.waitForResponse((response) => {
        return new URL(response.url()).searchParams.get("cursor") === requested;
      });
      await page.evaluate(() => {
        scrollTo(0, 0);
      });
      expect(
        new URL((await reverseRequest).url()).searchParams.get("until"),
      ).toBe("2026-09-20");
      const response = await reverse;
      expect(response.ok()).toBe(true);
      const newerPage = await response.json();
      expect(newerPage.days[0].capturedOn < "2026-09-21").toBe(true);
      expect(newerPage.days[0].capturedOn > firstPage!.days[0]!).toBe(true);
      await expect(
        page.locator(`[id="day-${newerPage.days[0].capturedOn}"]`),
      ).toBeAttached();
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
      await page.goto("/?at=2026-09-20&from=2026-09-01");
      await page.getByRole("button", { name: "Clear the dates" }).click();
      await expect(page).not.toHaveURL(/at=|from=/);
      await expect(page.locator('[id="day-2026-10-13"]')).toBeAttached();
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
    });
  });
}
