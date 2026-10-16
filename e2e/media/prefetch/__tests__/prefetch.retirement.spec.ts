import { insertRemovalRequest } from "../../../../apps/server/test/helpers/seedHelpers/miscSeedHelpers.ts";

import {
  insertItemPerson,
  insertPerson,
} from "../../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

import type { Locator } from "@playwright/test";

import { prepareVisibilityRetirementCatalog } from "./prepareVisibilityRetirementCatalog.ts";
import { restrictItemToUploader } from "./restrictItemToUploader.ts";

import { expect, test } from "../../media.fixtures.ts";

import { expectCurrentPhotoDecoded } from "../../mediaMeasurementHelpers.ts";

test("a warmed photo is hidden when the actual selection loses visibility", async ({
  page,
  catalog,
  browser,
}) => {
  const start = catalog.itemIds[1010]!;
  const target = catalog.itemIds[1011]!;
  const owner = await prepareVisibilityRetirementCatalog({
    catalog,
    itemId: target,
  });
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${start}`);
  await expectCurrentPhotoDecoded(page);
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return (
          transfer.objectId.endsWith(`/${target}/display`) &&
          transfer.bodyBytes > 0
        );
      }).length;
    })
    .toBe(1);
  const ownerContext = await browser.newContext({ baseURL: catalog.origin });
  try {
    await ownerContext.addCookies([
      {
        name: "shoebox_session",
        value: owner.token,
        url: catalog.origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const ownerPage = await ownerContext.newPage();
    await restrictItemToUploader({ page: ownerPage, itemId: target });
  } finally {
    await ownerContext.close();
  }
  const selectionResponse = page.waitForResponse((response) => {
    return new URL(response.url()).pathname === `/api/items/${target}`;
  });
  await page
    .getByRole("button", { name: "Next photo or video", exact: true })
    .click();
  expect((await selectionResponse).status()).toBe(404);
  await expect(
    page.getByText("This one is not here.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(`[data-photo-item="${target}"]`)).toHaveCount(0);
  const opened = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("member_id", "=", catalog.memberId)
    .where("item_id", "=", target)
    .execute();
  expect(opened).toEqual([]);
});

test("every internal viewer entry preserves SPA navigation and exactly one actual open", async ({
  page,
  catalog,
}) => {
  const coldId = catalog.itemIds[1015]!;
  const personId = await insertPerson(catalog.database, {
    displayName: "Entry point member",
    member_id: catalog.memberId,
  });
  await insertItemPerson(catalog.database, { itemId: coldId, personId });
  const requester = await catalog.database
    .selectFrom("members")
    .select("id")
    .where("id", "!=", catalog.memberId)
    .executeTakeFirstOrThrow();
  await insertRemovalRequest(catalog.database, {
    requestedByMemberId: requester.id,
    itemUploaderMemberId: catalog.memberId,
    item_id: coldId,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  let actualSelections = 0;
  let documentRequests = 0;
  const openCount = async () => {
    const row = await catalog.database
      .selectFrom("item_views")
      .select(({ fn }) => {
        return fn.sum<number>("open_count").as("total");
      })
      .where("member_id", "=", catalog.memberId)
      .executeTakeFirstOrThrow();
    return Number(row.total ?? 0);
  };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests += 1;
    }
  });
  const select = async ({
    control,
    itemId,
  }: {
    control: Locator;
    itemId: string;
  }) => {
    await control.scrollIntoViewIfNeeded();
    await control.hover();
    expect(await openCount()).toBe(actualSelections);
    documentRequests = 0;
    await control.click();
    await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
    await expectCurrentPhotoDecoded(page);
    actualSelections += 1;
    await expect.poll(openCount).toBe(actualSelections);
    expect(documentRequests).toBe(0);
  };
  await page.goto("/api/media-evidence/session");
  const print = page.locator("button[data-item-id]").first();
  await select({
    control: print,
    itemId: (await print.getAttribute("data-item-id"))!,
  });
  await page.goto("/");
  await page.locator("[data-burst-id] button").first().click();
  const frame = page.locator("[data-fan-row] button[data-item-id]").first();
  const frameId = (await frame.getAttribute("data-item-id"))!;
  await select({ control: frame, itemId: frameId });
  const siblingId = catalog.itemIds[catalog.itemIds.indexOf(frameId) + 1]!;
  await select({
    control: page.locator(`nav a[href="/items/${siblingId}"]`),
    itemId: siblingId,
  });
  const followingId = catalog.itemIds[catalog.itemIds.indexOf(siblingId) + 1]!;
  await select({
    control: page.getByRole("button", {
      name: "Next photo or video",
      exact: true,
    }),
    itemId: followingId,
  });
  await select({
    control: page.getByRole("button", {
      name: "Previous photo or video",
      exact: true,
    }),
    itemId: siblingId,
  });
  await page
    .getByRole("button", { name: "More photo details", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Who opened this", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: `Measurement memory ${catalog.itemIds.indexOf(siblingId) + 1}`,
      exact: true,
    }),
  ).toBeVisible();
  await select({
    control: page.getByRole("link", { name: "Open this item", exact: true }),
    itemId: siblingId,
  });
  await page.goto(`/presence?itemId=${coldId}`);
  await expect(
    page.getByRole("img", { name: "Measurement memory 1016", exact: true }),
  ).toHaveCount(0);
  await select({
    control: page.getByRole("link", { name: "Open this item", exact: true }),
    itemId: coldId,
  });
  await page.goto(`/items/${coldId}/removal`);
  await select({
    control: page.getByRole("link", { name: "Back to the photo", exact: true }),
    itemId: coldId,
  });
  await page.goto(`/items/${coldId}/removal`);
  await select({
    control: page.getByRole("link", { name: "Never mind", exact: true }),
    itemId: coldId,
  });
  await page.goto("/removal-requests");
  await select({
    control: page.getByRole("link", {
      name: "Open the photograph",
      exact: true,
    }),
    itemId: coldId,
  });
  await page.goBack();
  await page
    .getByRole("button", { name: "Keep it, and say why", exact: true })
    .click();
  await select({
    control: page.getByRole("link", {
      name: "Change who can see it instead",
      exact: true,
    }),
    itemId: coldId,
  });
  expect(actualSelections).toBe(11);
  expect(await openCount()).toBe(actualSelections);
});
