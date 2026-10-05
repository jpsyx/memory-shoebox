import type { BrowserContext, Locator, Page } from "@playwright/test";
import type { AcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";
import { test, expect } from "./admin.fixtures.ts";

type Scenario = Readonly<{
  surface: "presence" | "viewers" | "changes";
  transition: "demoted" | "revoked";
}>;
const SCENARIOS: readonly Scenario[] = [
  { surface: "presence", transition: "demoted" },
  { surface: "presence", transition: "revoked" },
  { surface: "viewers", transition: "demoted" },
  { surface: "viewers", transition: "revoked" },
  { surface: "changes", transition: "demoted" },
  { surface: "changes", transition: "revoked" },
];
SCENARIOS.forEach((scenario) => {
  const { surface, transition } = scenario;
  const isSelfScope = surface === "presence" && transition === "demoted";
  const label = isSelfScope
    ? "presence replaces privileged records with the real demoted self-only response"
    : `${surface} reconciles an actual ${transition} refusal after reconnect`;
  test(label, async ({ page, context, catalog }) => {
    const { record, endpoint } = await _openObservation(page, catalog, surface);
    await _changeAuthority(catalog, transition);
    const refresh = page.waitForResponse((response) => {
      return (
        new URL(response.url()).pathname === endpoint &&
        response.status() ===
          (isSelfScope ? 200 : transition === "demoted" ? 403 : 401)
      );
    });
    await _reconnectStaleBrowser(page, context);
    const response = await refresh;
    if (isSelfScope) {
      const body = await response.json();
      expect(body.presence).toHaveLength(1);
      expect(body.presence[0].member.memberId).toBe(catalog.admin.memberId);
      await expect(page.getByRole("row")).toHaveCount(2);
      await expect(
        page.getByRole("cell", { name: "Abuela Rosa", exact: true }),
      ).toHaveCount(0);
      return;
    }
    await expect(record).toHaveCount(0);
    await _expectAuthorityDestination(page, scenario);
  });
});

async function _openObservation(
  page: Page,
  catalog: Readonly<AcceptanceCatalog>,
  surface: Scenario["surface"],
): Promise<{ record: Locator; endpoint: string }> {
  await catalog.app.inject({
    method: "PATCH",
    url: "/api/settings",
    headers: { cookie: catalog.admin.cookie },
    payload: { shoebox: { name: "Authority fixture" } },
  });
  const route =
    surface === "viewers"
      ? `/presence?itemId=${catalog.itemId}`
      : surface === "changes"
        ? "/changes"
        : "/presence";
  const endpoint =
    surface === "viewers"
      ? `/api/items/${catalog.itemId}/viewers`
      : surface === "changes"
        ? "/api/activity"
        : "/api/presence";
  await page.goto(
    `/api/evidence/session/admin?to=${encodeURIComponent(route)}`,
  );
  const record =
    surface === "changes"
      ? page.getByText(/changed the Shoebox name/).first()
      : surface === "viewers"
        ? page.getByText("Abuela Rosa", { exact: true })
        : page.getByRole("table");
  await expect(record).toBeVisible();
  return { record, endpoint };
}
async function _changeAuthority(
  catalog: Readonly<AcceptanceCatalog>,
  transition: Scenario["transition"],
): Promise<void> {
  if (transition === "demoted") {
    await catalog.database
      .updateTable("members")
      .set({ role: "viewer" })
      .where("id", "=", catalog.admin.memberId)
      .execute();
  } else {
    await catalog.database
      .deleteFrom("sessions")
      .where("id", "=", catalog.admin.sessionId)
      .execute();
  }
}
async function _reconnectStaleBrowser(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  // Advance browser freshness only; server sessions retain their real clock.
  await page.clock.setFixedTime(new Date(Date.now() + 31_000));
  // Await listener registration before changing connectivity.
  await page.evaluate(() => {
    window.addEventListener(
      "offline",
      () => {
        document.documentElement.dataset.observedOffline = "true";
      },
      { once: true },
    );
  });
  await context.setOffline(true);
  await page.waitForFunction(() => {
    return document.documentElement.dataset.observedOffline === "true";
  });
  await context.setOffline(false);
}
async function _expectAuthorityDestination(
  page: Page,
  scenario: Scenario,
): Promise<void> {
  if (scenario.transition === "demoted") {
    await expect(
      page.getByText(
        scenario.surface === "changes"
          ? "Only an admin can view changes."
          : "Only an admin can view presence.",
      ),
    ).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/sign-in/);
  }
}
