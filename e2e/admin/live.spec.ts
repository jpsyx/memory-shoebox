import type { AcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";
import { insertUploadSession } from "../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import { test, expect } from "./admin.fixtures.ts";
import {
  insertPerson,
  insertBurst,
} from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
async function _expectResentInvitation(
  catalog: Readonly<AcceptanceCatalog>,
): Promise<void> {
  await expect
    .poll(async () => {
      return (
        await catalog.database
          .selectFrom("invitations")
          .select("send_count")
          .where("member_id", "=", catalog.invited)
          .executeTakeFirstOrThrow()
      ).send_count;
    })
    .toBe(2);
}

async function _seedPassiveBurst(
  catalog: Readonly<AcceptanceCatalog>,
): Promise<void> {
  const upload = await insertUploadSession(catalog.database, {
    uploadedBy: catalog.admin.memberId,
  });
  const burst = await insertBurst(catalog.database, {
    uploadSessionId: upload,
    capturedOn: "2026-09-27",
  });
  await catalog.database
    .updateTable("items")
    .set({ burst_id: burst, burst_index: 1 })
    .where("id", "=", catalog.itemId)
    .execute();
  await catalog.database
    .updateTable("items")
    .set({ burst_id: burst, burst_index: 2 })
    .where("id", "=", "00000000-0000-4000-8000-000000000010")
    .execute();
  await catalog.database
    .updateTable("bursts")
    .set({ cover_item_id: catalog.itemId })
    .where("id", "=", burst)
    .execute();
}

test("Running the Shoebox opens every live administrative surface", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/account");
  for (const [name, path] of [
    ["Shoebox settings", "/settings"],
    ["Members and groups", "/members"],
    ["Who has been looking", "/presence"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.getByRole("link", { name: "Back to my account" }).click();
  }
  await page
    .getByRole("link", { name: "Members and groups", exact: true })
    .click();
  await page.getByRole("link", { name: "Groups", exact: true }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByRole("link", { name: "Back to my account" }).click();
  await page
    .getByRole("link", { name: "Members and groups", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Changes by Elena", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/changes\\?actorMemberId=${catalog.admin.memberId}$`),
  );
});
test("last active admin role and removal guards agree with the real API", async ({
  page,
  catalog,
}) => {
  await catalog.database
    .updateTable("members")
    .set({ role: "uploader" })
    .where("id", "=", catalog.secondAdmin)
    .execute();
  await page.goto("/api/evidence/session/admin?to=/members");
  await page.getByRole("button", { name: "Change role for Elena" }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("viewer");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove Elena", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove them" }),
  ).toBeDisabled();
  expect(
    (
      await page.request.patch(`/api/members/${catalog.admin.memberId}`, {
        data: { role: "viewer" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.delete(`/api/members/${catalog.admin.memberId}`)
    ).status(),
  ).toBe(409);
});
test("shows the suggested name, disables resend and persists resend count and revocation", async ({
  page,
  catalog,
}) => {
  await insertPerson(catalog.database, { displayName: "New cousin" });
  await page.goto("/api/evidence/session/admin?to=/members");
  await page
    .getByRole("button", { name: "Invite somebody", exact: true })
    .click();
  await page.getByLabel("Their email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Their email", { exact: true }).blur();
  await expect(page.getByLabel("What to call them")).toHaveValue("New cousin");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Send invitation again to Lucía" })
    .click();
  await expect(
    page.getByRole("button", { name: "Send invitation again to Lucía" }),
  ).toBeDisabled();
  await _expectResentInvitation(catalog);
  await page
    .getByRole("button", { name: "Revoke invitation for Lucía" })
    .click();
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await catalog.database
        .selectFrom("invitations")
        .select("revoked_at")
        .where("member_id", "=", catalog.invited)
        .executeTakeFirstOrThrow()
    ).revoked_at,
  ).not.toBeNull();
});
(["device", "remove"] as const).forEach((action) => {
  test(`${action} of the current member clears the session without a failing account refresh`, async ({
    page,
    catalog,
  }) => {
    await page.goto("/api/evidence/session/admin?to=/members");
    await expect(
      page.getByRole("button", { name: "Remove Elena", exact: true }),
    ).toBeVisible();
    const reads: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/me") {
        reads.push(request.method());
      }
    });
    await page
      .getByRole("button", {
        name:
          action === "device"
            ? "Sign out Chrome on Mac for Elena"
            : "Remove Elena",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: action === "device" ? "Sign out here" : "Remove them",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(reads).toEqual([]);
    expect(
      await catalog.database
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", catalog.admin.sessionId)
        .execute(),
    ).toHaveLength(0);
  });
});
test("group deletion describes both directions and renews changed confirmation", async ({
  page,
  catalog,
  otherAdminPage,
}) => {
  await page.goto("/api/evidence/session/admin?to=/groups");
  await page
    .getByRole("button", { name: "Delete Cousins", exact: true })
    .click();
  await expect(page.getByText(/1 item loses access/)).toBeVisible();
  await expect(page.getByText(/1 item gains access/)).toBeVisible();
  await otherAdminPage.goto("/groups");
  await otherAdminPage
    .getByRole("button", { name: "Edit Cousins", exact: true })
    .click();
  const editor = otherAdminPage.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Who is in it" }).click();
  await otherAdminPage.getByRole("option", { name: /Mateo/ }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Delete it anyway" }).click();
  await expect(
    page.getByText(
      "Usage changed. Review these consequences and confirm again.",
    ),
  ).toBeVisible();
  expect(
    await catalog.database
      .selectFrom("groups")
      .selectAll()
      .where("id", "=", catalog.group)
      .execute(),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Delete it anyway" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await catalog.database
      .selectFrom("groups")
      .selectAll()
      .where("id", "=", catalog.group)
      .execute(),
  ).toHaveLength(0);
});
test("settings arrangement preview stays local until save", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/settings");
  await page
    .getByRole("radiogroup", { name: "Pile arrangement" })
    .getByText("Tidy", { exact: true })
    .click();
  const arrangementRowsBeforeSave = await catalog.database
    .selectFrom("settings")
    .selectAll()
    .where("key", "=", "pile.arrangement")
    .execute();
  expect(arrangementRowsBeforeSave).toEqual([]);
  await page
    .getByRole("button", { name: "Save arrangement", exact: true })
    .click();
  await expect(
    page.getByText("The arrangement has been saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Tidy", exact: true }),
  ).toBeChecked();
});
test("retains combined activity filters in the URL and request", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/presence");
  await expect(page.getByText("Abuela Rosa", { exact: true })).toBeVisible();
  await page.goto(
    `/changes?actorMemberId=${catalog.admin.memberId}&subjectId=${catalog.group}`,
  );
  const response = page.waitForResponse((answer) => {
    return (
      answer.url().includes("/api/activity?") &&
      answer.url().includes("family=authority")
    );
  });
  await page
    .getByRole("button", { name: "Who can see what", exact: true })
    .click();
  const answer = await response;
  expect(answer.ok()).toBe(true);
  expect(new URL(answer.url()).searchParams.get("actorMemberId")).toBe(
    catalog.admin.memberId,
  );
  expect(new URL(answer.url()).searchParams.get("subjectId")).toBe(
    catalog.group,
  );
  await expect(page).toHaveURL(/family=authority/);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/changes$/);
});
test("direct passive report and retry never opens the actual item", async ({
  page,
  catalog,
}) => {
  await _seedPassiveBurst(catalog);
  const itemViewsBeforeObservation = await catalog.database
    .selectFrom("item_views")
    .selectAll()
    .execute();
  const itemRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/api/items/${catalog.itemId}`) {
      itemRequests.push(request.method());
    }
  });
  await page.goto(
    `/api/evidence/session/admin?to=${encodeURIComponent(`/presence?itemId=${catalog.itemId}`)}`,
  );
  await expect(
    page.getByRole("link", { name: "Open this item" }),
  ).toBeVisible();
  await page.route(`**/api/items/${catalog.itemId}/viewers*`, (route) => {
    return route.fulfill({
      status: 503,
      json: { error: "unavailable", message: "Temporary viewer read failure" },
    });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.unroute(`**/api/items/${catalog.itemId}/viewers*`);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("link", { name: "Open this item" }),
  ).toBeVisible();
  expect(itemRequests).toEqual([]);
  expect(
    await catalog.database.selectFrom("item_views").selectAll().execute(),
  ).toEqual(itemViewsBeforeObservation);
});
