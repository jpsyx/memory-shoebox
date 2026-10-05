import { expect } from "../admin.fixtures.ts";
import { prepareSettingsVisual } from "./prepareSettingsVisual.ts";
import type { AdminVisualCapture, AdminVisualCase } from "./visual.types.ts";
function _makeQueryFromVisualCase({
  surface,
  state,
  catalog,
}: Readonly<AdminVisualCase>): string {
  return surface === "presence" && state === "one-item"
    ? `?itemId=${catalog.itemId}`
    : state === "authority"
      ? "?family=authority"
      : state === "person"
        ? `?actorMemberId=${catalog.admin.memberId}`
        : state === "gone"
          ? "?subjectId=00000000-0000-4000-8000-000000000010"
          : "";
}
/** Loads one real administrative state at its requested viewport and scheme. */
export async function prepareAdminVisual(
  options: Readonly<AdminVisualCapture>,
): Promise<void> {
  const { page, width, scheme, surface } = options;
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(
    `/api/evidence/session/admin?to=${encodeURIComponent(`/${surface}${_makeQueryFromVisualCase(options)}`)}`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await prepareSettingsVisual(options);
  if (surface === "presence") {
    await expect(
      page.getByText("Abuela Rosa", { exact: true }).first(),
    ).toBeVisible();
  }
  if (surface === "changes") {
    await expect(
      page.getByRole("region", { name: "What has been changed" }),
    ).toBeVisible();
  }
}
