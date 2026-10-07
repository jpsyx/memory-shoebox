import type { Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";

async function _pickLocalBatch(page: Page): Promise<string> {
  await page.goto("/api/evidence/session/admin?to=/");
  await page.getByRole("link", { name: "Add", exact: true }).click();
  const picker = page.getByLabel("Choose photographs and videos", {
    exact: true,
  });
  await expect(picker).toBeEnabled();
  await page
    .getByLabel("Choose photographs and videos", { exact: true })
    .setInputFiles([
      "e2e/fixtures/upload/portrait-orientation-6.jpg",
      "e2e/fixtures/upload/heic-rotated.heic",
    ]);
  await expect(page.getByRole("button", { name: "Put 2 up" })).toBeEnabled();
  return new URL(page.url()).searchParams.get("session")!;
}

(["browser back", "back to pile", "refresh", "close tab"] as const).forEach(
  (exit) => {
    test(`${exit} discards a batch that has not started uploading`, async ({
      page,
      catalog,
    }) => {
      const sessionId = await _pickLocalBatch(page);
      if (exit === "refresh") {
        await page.reload();
      } else if (exit === "close tab") {
        const context = page.context();
        await page.close();
        page = await context.newPage();
        await page.goto(`${catalog.origin}/upload`);
      } else {
        if (exit === "browser back") {
          await page.goBack();
        } else {
          await page
            .getByRole("link", { name: "Back to the timeline", exact: true })
            .click();
        }
        await expect(page).toHaveURL(catalog.origin + "/");
        await page.getByRole("link", { name: "Add", exact: true }).click();
      }
      await expect(page.getByRole("button", { name: "Put 2 up" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", {
          name: "Choose the files again",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page).toHaveURL(catalog.origin + "/upload");
      await expect
        .poll(async () => {
          return (
            await catalog.database
              .selectFrom("upload_sessions")
              .where("id", "=", sessionId)
              .select("state")
              .executeTakeFirstOrThrow()
          ).state;
        })
        .toBe("cancelled");
      await page
        .getByLabel("Choose photographs and videos", { exact: true })
        .setInputFiles("e2e/fixtures/upload/h264-clip.mp4");
      await expect(
        page.getByRole("button", { name: "Put 1 up" }),
      ).toBeEnabled();
      expect(new URL(page.url()).searchParams.get("session")).not.toBe(
        sessionId,
      );
      await expect(page.getByRole("button", { name: "Put 3 up" })).toHaveCount(
        0,
      );
    });
  },
);

test("an armed upload survives navigation and refresh as a recoverable batch", async ({
  page,
  catalog,
}) => {
  const sessionId = await _pickLocalBatch(page);
  const held = Promise.withResolvers<void>();
  await page.route(
    "**/api/upload-sessions/*/files/*/presign",
    async (route) => {
      await held.promise;
      await route.abort();
    },
  );
  try {
    await page.getByRole("button", { name: "Put 2 up" }).click();
    await expect
      .poll(async () => {
        return (
          await catalog.database
            .selectFrom("upload_sessions")
            .where("id", "=", sessionId)
            .select("state")
            .executeTakeFirstOrThrow()
        ).state;
      })
      .toBe("uploading");
    await page
      .getByRole("link", { name: "Back to the timeline", exact: true })
      .click();
    await page.getByRole("link", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Putting them up." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "You were in the middle of this." }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("session")).toBe(sessionId);
    expect(
      (
        await catalog.database
          .selectFrom("upload_sessions")
          .where("id", "=", sessionId)
          .select("state")
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("uploading");
  } finally {
    held.resolve();
  }
});
