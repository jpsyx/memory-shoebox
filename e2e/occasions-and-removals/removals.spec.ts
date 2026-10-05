import {
  listItemRemovalRequestsResponseSchema,
  listRemovalRequestsResponseSchema,
} from "@memory-shoebox/shared";
import type { Page } from "@playwright/test";
import { UPLOADER_EMAIL } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getImageWidthFromPage } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { getRemovalMailFromOutbox } from "./support/getRemovalMailFromOutbox/getRemovalMailFromOutbox.ts";
import {
  seedWithdrawnRemovalRequest,
  sendBlankRemovalAsk,
} from "./support/removalBrowserHelpers.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
const WITHDRAWAL_MAIL_MATCHER = [
  expect.objectContaining({
    state: "queued",
    payload: expect.objectContaining({
      outcome: "withdrawn",
      withdrawnByDisplayName: "Inés Álvarez",
    }),
  }),
] satisfies Array<ReturnType<typeof expect.objectContaining>>;
async function _expectSettledDeletion({
  page,
  itemId,
}: Readonly<{ page: Readonly<Page>; itemId: string }>): Promise<void> {
  await expect(page).toHaveURL(/\/removal-requests/);
  const settledResponse = await page.request.get(
    "/api/removal-requests?state=settled",
  );
  const settled = listRemovalRequestsResponseSchema.parse(
    await settledResponse.json(),
  ).removalRequests;
  expect(
    settled.filter((request) => {
      return request.itemId === null && request.state === "deleted";
    }),
  ).toHaveLength(2);
  expect((await page.request.get(`/api/items/${itemId}`)).status()).toBe(404);
  await page.getByRole("tab", { name: /Settled/ }).click();
  const goneCards = page.getByRole("region").filter({ hasText: "Gone" });
  await expect(goneCards).toHaveCount(2);
  await expect(goneCards.locator("img")).toHaveCount(0);
  await expect(page.locator(`a[href="/items/${itemId}"]`)).toHaveCount(0);
}

test("live blank withdrawal removes role-specific controls and notifies the uploader", async ({
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
      return getImageWidthFromPage(askerPage);
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
      return getRemovalMailFromOutbox({ address: UPLOADER_EMAIL, itemId });
    })
    .toEqual(WITHDRAWAL_MAIL_MATCHER);
  await uploaderPage.reload();
  await expect(
    uploaderPage.getByRole("button", { name: "Delete it", exact: true }),
  ).toHaveCount(0);
});

test("live reasoned ask and exact decline permit a fresh request", async ({
  askerPage,
  uploaderPage,
}) => {
  const request = await seedWithdrawnRemovalRequest({
    page: askerPage,
    label: "Removal reasoned retry",
  });
  await askerPage.goto(`/items/${request.itemId}/removal`);
  await uploaderPage.goto(`/items/${request.itemId}/removal`);
  await askerPage.getByRole("button", { name: "Ask again" }).click();
  const REASON = "Please take this down, I am mid-sentence.";
  await askerPage.getByLabel("Why, if you want to say").fill(REASON);
  await askerPage.getByRole("button", { name: "Send the request" }).click();
  await expect(askerPage.getByText(REASON, { exact: true })).toBeVisible();
  await uploaderPage.reload();
  await uploaderPage.getByRole("button", { name: /Keep it, and/ }).click();
  const REPLY = "It is the only photograph with all four of us. Ánimo, Inés.";
  await uploaderPage.getByRole("dialog").getByRole("textbox").fill(REPLY);
  await uploaderPage
    .getByRole("button", { name: "Send this and keep it" })
    .click();
  await expect(uploaderPage.getByRole("dialog")).toHaveCount(0);
  await askerPage.reload();
  await expect(askerPage.getByText(REPLY, { exact: true })).toBeVisible();
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
  await sendBlankRemovalAsk({ page: askerPage, itemId });
  await expect(
    askerPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  await sendBlankRemovalAsk({ page: adminPage, itemId });
  await expect(
    adminPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  const itemRequestsResponse = await adminPage.request.get(
    `/api/items/${itemId}/removal-requests`,
  );
  const before = listItemRemovalRequestsResponseSchema.parse(
    await itemRequestsResponse.json(),
  ).removalRequests;
  expect(
    before.filter((request) => {
      return request.state === "open";
    }),
  ).toHaveLength(2);
  await adminPage
    .getByRole("button", { name: "Delete it", exact: true })
    .first()
    .click();
  await adminPage
    .getByRole("dialog")
    .getByRole("button", { name: "Delete it", exact: true })
    .click();
  await _expectSettledDeletion({ page: adminPage, itemId });
});
