import { signInCodeEmailPayloadSchema } from "@memory-shoebox/shared";
import { test, expect } from "./setup.fixtures.ts";
import { createSetup, fillSetup, expectUploadHome } from "./setup.actions.ts";

test("creation, email review/back and skip reach upload-capable home", async ({
  page,
  catalog,
}) => {
  await page.goto("/items/missing");
  await expect(page).toHaveURL(/\/setup$/);
  await fillSetup(page, " Rosa@Example.com ");
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Review your email" }),
  ).toContainText("rosa@example.com");
  expect(catalog.assertions.members()).toEqual([]);
  await page.getByRole("button", { name: "Go back and edit" }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Rosa",
  );
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await page.getByRole("button", { name: "Create your Shoebox" }).click();
  await expect(page).toHaveURL(/\/setup\/invite$/);
  const members = catalog.assertions.members();
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({
    email: "rosa@example.com",
    role: "admin",
    status: "active",
  });
  expect(catalog.assertions.pendingMemberId()).toBe(members[0]?.id);
  expect(catalog.assertions.emails()).toEqual([]);
  await expect(page.getByRole("status")).toContainText("Set a sender email");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expectUploadHome(page);
  expect(catalog.assertions.pendingMemberId()).toBeNull();
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await expect(page).toHaveURL(/\/upload$/);
});

test("multiple intended invitations queue once and finish setup", async ({
  page,
  catalog,
}) => {
  await createSetup(page);
  await page.getByLabel("Email 1", { exact: true }).fill("mateo@example.com");
  await page.getByLabel("Name 1 (optional)").fill("Mateo");
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByLabel("Email 2", { exact: true }).fill("ana@example.com");
  await page.getByLabel("Role 2").selectOption("uploader");
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expectUploadHome(page);
  expect(catalog.assertions.members()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        email: "mateo@example.com",
        role: "viewer",
        status: "invited",
      }),
      expect.objectContaining({
        email: "ana@example.com",
        role: "uploader",
        status: "invited",
      }),
    ]),
  );
  expect(catalog.assertions.invitations()).toHaveLength(2);
  expect(
    catalog.assertions.emails().filter((email) => {
      return email.kind === "invitation";
    }),
  ).toHaveLength(2);
  expect(
    catalog.assertions.emails().every((email) => {
      return email.state === "queued";
    }),
  ).toBe(true);
  expect(catalog.assertions.pendingMemberId()).toBeNull();
});

test("partial failure preserves queued rows and retries only unfinished rows", async ({
  page,
  catalog,
}) => {
  await createSetup(page);
  await page.getByLabel("Email 1", { exact: true }).fill("one@example.com");
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByLabel("Email 2", { exact: true }).fill("two@example.com");
  await page.route("**/api/members", async (route) => {
    if (
      route.request().method() === "POST" &&
      (route.request().postDataJSON() as { email: string }).email ===
        "two@example.com"
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "temporary_failure", message: "Please retry" },
        }),
      });
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation queued for one" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry invitations" }),
  ).toBeVisible();
  expect(catalog.assertions.invitations()).toHaveLength(1);
  await page.unroute("**/api/members");
  await page.getByRole("button", { name: "Retry invitations" }).click();
  await expectUploadHome(page);
  expect(catalog.assertions.invitations()).toHaveLength(2);
  expect(
    catalog.assertions.invitations().every((invitation) => {
      return invitation.send_count === 1;
    }),
  ).toBe(true);
});

test("reload recovers durable pending progress and initialized deep links bypass creation", async ({
  page,
  browser,
  catalog,
}) => {
  await createSetup(page);
  await page.reload();
  await expect(page.getByLabel("Email 1", { exact: true })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/setup\/invite$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/setup");
  await expectUploadHome(page);
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const outsider = await anonymous.newPage();
    await outsider.goto(`${catalog.origin}/items/missing`);
    await expect(outsider).toHaveURL(/\/sign-in/);
    await expect(outsider.getByLabel("Your email")).toBeVisible();
    await outsider.goto(`${catalog.origin}/setup`);
    await expect(outsider).toHaveURL(/\/sign-in/);
  } finally {
    await anonymous.close();
  }
});

test("a stale second setup tab loses creation without another member or settings write", async ({
  page,
  browser,
  catalog,
}) => {
  const competitor = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const other = await competitor.newPage();
    await other.goto(`${catalog.origin}/setup`);
    await fillSetup(other, "other@example.com");
    await other
      .getByLabel("Shoebox name", { exact: true })
      .fill("Losing Shoebox");
    await other
      .getByRole("button", { name: "Review your email", exact: true })
      .click();
    await createSetup(page);
    await other.getByRole("button", { name: "Create your Shoebox" }).click();
    await expect(other).toHaveURL(/\/sign-in/);
    expect(catalog.assertions.members()).toHaveLength(1);
    expect(catalog.assertions.members()[0]?.email).toBe("rosa@example.com");
    expect(catalog.assertions.shoeboxName()).toBe("Family photographs");
  } finally {
    await competitor.close();
  }
});

test("lost creation answer with received cookie recovers the real admin session", async ({
  page,
  catalog,
}) => {
  await page.route("**/api/setup", async (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    const response = await route.fetch();
    // Preserve only the actual Set-Cookie seam, while making the body unusable.
    await route.fulfill({ response, body: "lost-answer" });
  });
  await createSetup(page);
  expect(catalog.assertions.members()).toHaveLength(1);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expectUploadHome(page);
});

test("lost creation answer without a cookie leads to ordinary recovery sign-in", async ({
  page,
  catalog,
}) => {
  await page.route("**/api/setup", async (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    await route.fetch();
    await page.context().clearCookies();
    await route.abort("failed");
  });
  await page.goto("/setup");
  await fillSetup(page);
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await page.getByRole("button", { name: "Create your Shoebox" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect(catalog.assertions.members()).toHaveLength(1);
});

test("lost invitation answer checks the real directory before avoiding duplicate send", async ({
  page,
  catalog,
}) => {
  await createSetup(page);
  await page.getByLabel("Email 1", { exact: true }).fill("lost@example.com");
  await page.route("**/api/members", async (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expectUploadHome(page);
  expect(catalog.assertions.invitations()).toHaveLength(1);
  expect(catalog.assertions.emails()).toHaveLength(1);
});

test("join is a correctable prefill, requests no code, then real code accepts invitation", async ({
  page,
  browser,
  catalog,
}) => {
  await createSetup(page);
  await page.getByLabel("Email 1", { exact: true }).fill("joined@example.com");
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expectUploadHome(page);
  const inviteeContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const invitee = await inviteeContext.newPage();
    await invitee.goto(`${catalog.origin}/join?address=joined%40example.com`);
    await expect(invitee.getByLabel("Your email")).toHaveValue(
      "joined@example.com",
    );
    expect(
      catalog.assertions.emails().filter((email) => {
        return email.kind === "sign_in_code";
      }),
    ).toEqual([]);
    await invitee
      .getByRole("button", { name: "Email me a code", exact: true })
      .click();
    await expect(
      invitee.getByLabel("The six digits we just emailed you"),
    ).toBeVisible();
    const email = catalog.assertions.emails().find((message) => {
      return message.kind === "sign_in_code";
    });
    const payload = signInCodeEmailPayloadSchema.parse(
      JSON.parse(email?.payload_json ?? "{}"),
    );
    await invitee
      .getByLabel("The six digits we just emailed you")
      .fill(payload.code);
    await invitee
      .getByRole("button", { name: "Open the photos", exact: true })
      .click();
    await expect(invitee).toHaveURL(/\/$/);
    expect(
      catalog.assertions.members().find((member) => {
        return member.email === "joined@example.com";
      })?.status,
    ).toBe("active");
    expect(catalog.assertions.invitations()[0]?.accepted_at).not.toBeNull();
  } finally {
    await inviteeContext.close();
  }
});
