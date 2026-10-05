import type { Page } from "@playwright/test";
import { makeItemSummaryFromOverrides } from "../../../../apps/web/src/testing/askingAndOccasionsFixtures.ts";
import { prepareVisualRemoval } from "./prepareVisualRemoval.ts";
import { prepareVisualOccasion } from "./prepareVisualOccasion.ts";

/** Sets one explicitly controlled visual state, preserving real session credentials. */
export async function showControlledVisualState(options: {
  page: Page;
  surface: string;
  state: string;
  scheme: "light" | "dark";
  longText?: boolean;
}): Promise<string> {
  const { page, surface, state, scheme } = options;
  await page.unrouteAll({ behavior: "wait" });
  const me = await (await page.request.get("/api/me")).json();
  const member = me.me.member;
  const { actorRole, item } = _makeVisualActorAndItem(member, surface, state);
  await page.route("**/api/me", async (route) => {
    await route.fulfill({ json: { ...me, me: { ...me.me, role: actorRole } } });
  });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.addInitScript(
    (rendition) => {
      document.documentElement.dataset.rendition = rendition;
      localStorage.setItem(
        "mantine-color-scheme-value",
        rendition === "night" ? "dark" : "light",
      );
    },
    scheme === "dark" ? "night" : "day",
  );
  const url =
    surface === "milestones"
      ? await prepareVisualOccasion({ page, state, item })
      : await prepareVisualRemoval({ ...options, member, item });
  await page.goto(url);
  await page.locator("main").waitFor();
  await _activateVisualState(page, surface, state);
  return `http://localhost:5174/s/${surface}?state=${state}`;
}

/** Hides only the prototype navigation chrome, leaving its product UI unchanged. */
export async function hidePrototypeSwitcher(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '[class*="rail_"] { display: none !important; } [class*="railCollapsed"] { display: none !important; }',
  });
}

function _makeVisualActorAndItem(
  member: { memberId: string },
  surface: string,
  state: string,
) {
  const actorRole =
    surface === "removal" && ["ask", "already", "declined"].includes(state)
      ? "viewer"
      : state === "uploader"
        ? "uploader"
        : "admin";
  const source = {
    url: "http://localhost:5174/media/web/highChair-thumb.jpg",
    expiresAt: "2027-10-04T12:00:00.000Z",
    width: 1600,
    height: 1067,
  };
  const baselineItem = makeItemSummaryFromOverrides();
  const item = makeItemSummaryFromOverrides({
    media: {
      ...baselineItem.media,
      thumb: source,
      display: {
        ...source,
        url: "http://localhost:5174/media/web/highChair.jpg",
      },
    },
    uploadedBy: {
      memberId:
        state === "uploader"
          ? member.memberId
          : baselineItem.uploadedBy.memberId,
      displayName: "Papá",
    },
  });
  return { actorRole, item };
}

async function _activateVisualState(
  page: Page,
  surface: string,
  state: string,
): Promise<void> {
  if (state === "create-span")
    await page
      .getByRole("switch", { name: "It ran over more than one day" })
      .check();
  if (surface === "removal-requests" && state === "settled")
    await page.getByRole("tab", { name: /Settled/ }).click();
  if (surface === "removal-requests" && state === "deleting")
    await page
      .getByRole("button", { name: "Delete it", exact: true })
      .first()
      .click();
  if (surface === "removal-requests" && state === "declining")
    await page
      .getByRole("button", { name: "Keep it, and say why", exact: true })
      .first()
      .click();
}
