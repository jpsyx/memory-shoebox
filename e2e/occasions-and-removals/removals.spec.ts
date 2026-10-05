import { test, expect } from "./asking-occasions.fixtures.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
import { readRemovalMail } from "./support/readRemovalMail/readRemovalMail.ts";
import { UPLOADER_EMAIL } from "./asking-occasions.constants.ts";

test("live blank withdrawal notifies the uploader, then reasoned ask and exact decline allow asking again", async ({
  askerPage,
  uploaderPage,
  adminPage,
}) => {
  const { itemId } = await seedAskingAndOccasions({
    label: "Removal live withdrawal",
  });
  await askerPage.goto(`/items/${itemId}/removal`);
  await expect(askerPage.locator("img").first()).toBeVisible();
  await expect
    .poll(() => {
      return askerPage
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => {
          return image.naturalWidth;
        });
    })
    .toBeGreaterThan(0);
  await expect(
    askerPage.getByRole("button", { name: "Delete it", exact: true }),
  ).toHaveCount(0);
  await expect(askerPage.getByRole("button", { name: /Keep it/ })).toHaveCount(
    0,
  );
  await askerPage.getByRole("button", { name: "Send the request" }).click();
  await expect(
    askerPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  await uploaderPage.goto(`/items/${itemId}/removal`);
  await expect(uploaderPage.getByText(/No reason given/)).toBeVisible();
  await adminPage.goto(`/items/${itemId}/removal`);
  await expect(
    adminPage.getByRole("button", { name: "Withdraw the request" }),
  ).toHaveCount(0);
  await askerPage.getByRole("button", { name: "Withdraw the request" }).click();
  await expect(askerPage.getByText("You withdrew this request.")).toBeVisible();
  await expect
    .poll(() => {
      return readRemovalMail({ address: UPLOADER_EMAIL, itemId });
    })
    .toEqual([
      expect.objectContaining({
        state: "queued",
        payload: expect.objectContaining({
          outcome: "withdrawn",
          withdrawnByDisplayName: "Inés Álvarez",
        }),
      }),
    ]);
  await uploaderPage.reload();
  await expect(
    uploaderPage.getByRole("button", { name: "Delete it", exact: true }),
  ).toHaveCount(0);
  await askerPage.getByRole("button", { name: "Ask again" }).click();
  const reason = "Please take this down, I am mid-sentence.";
  await askerPage.getByLabel("Why, if you want to say").fill(reason);
  await askerPage.getByRole("button", { name: "Send the request" }).click();
  await expect(askerPage.getByText(reason, { exact: true })).toBeVisible();
  await uploaderPage.reload();
  await uploaderPage.getByRole("button", { name: /Keep it, and/ }).click();
  const reply = "It is the only photograph with all four of us. Ánimo, Inés.";
  await uploaderPage.getByRole("dialog").getByRole("textbox").fill(reply);
  await uploaderPage
    .getByRole("button", { name: "Send this and keep it" })
    .click();
  await expect(uploaderPage.getByRole("dialog")).toHaveCount(0);
  await askerPage.reload();
  await expect(askerPage.getByText(reply, { exact: true })).toBeVisible();
  await askerPage.getByRole("button", { name: "Ask again" }).click();
  await expect(askerPage.getByLabel("Why, if you want to say")).toBeVisible();
});

test("live admin delete settles both open asks and removes the item address", async ({
  askerPage,
  adminPage,
}) => {
  const { itemId } = await seedAskingAndOccasions({
    label: "Removal live two asks",
  });
  await askerPage.goto(`/items/${itemId}/removal`);
  await askerPage.getByRole("button", { name: "Send the request" }).click();
  await expect(
    askerPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  await adminPage.goto(`/items/${itemId}/removal`);
  await adminPage.getByRole("button", { name: "Send the request" }).click();
  await expect(
    adminPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  const before = await adminPage.request.get(
    `/api/items/${itemId}/removal-requests`,
  );
  expect(
    (await before.json()).removalRequests.filter(
      (request: { state: string }) => {
        return request.state === "open";
      },
    ),
  ).toHaveLength(2);
  await adminPage
    .getByRole("button", { name: "Delete it", exact: true })
    .first()
    .click();
  await adminPage
    .getByRole("dialog")
    .getByRole("button", { name: "Delete it", exact: true })
    .click();
  await expect(adminPage).toHaveURL(/\/removal-requests/);
  const settled = await adminPage.request.get(
    "/api/removal-requests?state=settled",
  );
  expect(
    (await settled.json()).removalRequests.filter(
      (request: { itemId: string | null; state: string }) => {
        return request.itemId === null && request.state === "deleted";
      },
    ),
  ).toHaveLength(2);
  expect((await adminPage.request.get(`/api/items/${itemId}`)).status()).toBe(
    404,
  );
  await adminPage.getByRole("tab", { name: /Settled/ }).click();
  const goneCards = adminPage.getByRole("region").filter({ hasText: "Gone" });
  await expect(goneCards).toHaveCount(2);
  await expect(goneCards.locator("img")).toHaveCount(0);
  await expect(adminPage.locator(`a[href="/items/${itemId}"]`)).toHaveCount(0);
});
