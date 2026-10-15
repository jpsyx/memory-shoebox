import { test, expect } from "./admin.fixtures.ts";

test("navigation uses one bootstrap, no speculative bootstrap and no duplicate mounted account/setup read", async ({
  page,
}) => {
  await page.goto("/api/evidence/session/admin?to=/account");
  const settings = page.getByRole("link", {
    name: "Shoebox settings",
    exact: true,
  });
  await expect(settings).toBeVisible();
  const authorityRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      [
        "/api/bootstrap",
        "/api/me",
        "/api/setup",
        "/api/setup/progress",
      ].includes(path)
    )
      authorityRequests.push(path);
  });
  await page.clock.install();
  await settings.hover();
  await page.clock.runFor(300);
  expect(authorityRequests).toEqual([]);
  await settings.click();
  await expect(page.getByLabel("Shoebox name")).toBeVisible();
  expect(authorityRequests).toEqual(["/api/bootstrap"]);
  authorityRequests.length = 0;
  await page.getByRole("link", { name: "Back to my account" }).click();
  await expect(
    page.getByRole("heading", { name: "Where you are signed in" }),
  ).toBeVisible();
  expect(authorityRequests).toEqual(["/api/bootstrap"]);
});

for (const kind of ["settings", "groups"] as const) {
  test(`committed ${kind} survives failed navigation without cached writable authority or a repeated write`, async ({
    page,
  }, testInfo) => {
    await page.goto("/api/evidence/session/admin?to=/account");
    await page
      .getByRole("link", {
        name: kind === "settings" ? "Shoebox settings" : "Members and groups",
        exact: true,
      })
      .click();
    if (kind === "groups")
      await page.getByRole("link", { name: "Groups", exact: true }).click();
    const initialControl =
      kind === "settings"
        ? page.getByLabel("Shoebox name")
        : page.getByRole("button", { name: "New group" });
    await expect(initialControl).toBeEnabled();
    let writeCount = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === `/api/${kind}` &&
        request.method() === (kind === "settings" ? "PATCH" : "POST")
      )
        writeCount += 1;
    });
    await page.route("**/api/me", (route) => {
      return route.fulfill({
        status: 503,
        json: { error: "unavailable", message: "Account refresh unavailable." },
      });
    });
    if (kind === "settings") {
      await initialControl.fill("Bootstrap Family");
      await page.getByRole("button", { name: "Save the new name" }).click();
    } else {
      await initialControl.click();
      await page.getByLabel("What to call it").fill("Bootstrap Family");
      await page.getByRole("button", { name: "Create the group" }).click();
    }
    const savedMessage =
      kind === "settings"
        ? "The new name has been saved."
        : "The group has been created.";
    await expect(
      page.getByText(savedMessage, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Account refresh unavailable.").first(),
    ).toBeVisible();
    await page.route("**/api/bootstrap", (route) => {
      return route.fulfill({
        status: 503,
        json: { error: "unavailable", message: "Bootstrap unavailable." },
      });
    });
    // Browser history retains the in-memory committed continuation.
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Could not open this Shoebox." }),
    ).toBeVisible();
    await expect(page.getByText(savedMessage, { exact: true })).toBeVisible();
    await expect(initialControl).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("committed-bootstrap-recovery.png"),
    });
    expect(writeCount).toBe(1);
    await page.goForward();
    await page.unroute("**/api/bootstrap");
    await page.unroute("**/api/me");
    await page.getByRole("button", { name: "Retry account refresh" }).click();
    await expect(initialControl).toBeVisible();
    await page.getByRole("button", { name: "Retry account refresh" }).click();
    await expect(initialControl).toBeEnabled();
    expect(writeCount).toBe(1);
  });
}

test("removal preview and decline links keep SPA navigation and history", async ({
  page,
}) => {
  await page.goto("/api/evidence/session/admin?to=/removal-requests");
  const preview = page
    .getByRole("link", { name: "Open the photograph" })
    .first();
  await expect(preview).toBeVisible();
  const href = await preview.getAttribute("href");
  expect(href).toMatch(/^\/items\//);
  let documentNavigationCount = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documentNavigationCount += 1;
  });
  await preview.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  expect(documentNavigationCount).toBe(0);
  await page.goBack();
  await page
    .getByRole("button", { name: "Keep it, and say why" })
    .first()
    .click();
  const alternative = page.getByRole("link", {
    name: "Change who can see it instead",
  });
  await expect(alternative).toHaveAttribute("href", href!);
  await alternative.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  expect(documentNavigationCount).toBe(0);
});

test("anonymous navigation redirects with one current bootstrap", async ({
  page,
}) => {
  const paths: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      [
        "/api/bootstrap",
        "/api/me",
        "/api/setup",
        "/api/setup/progress",
      ].includes(path)
    ) {
      paths.push(path);
    }
  });
  await page.goto("/account?from=family");
  await expect(page.getByLabel("Your email")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  expect(paths).toEqual(["/api/bootstrap"]);
});
