import { makeReleaseStatusReaderFromDependencies } from "../../apps/server/src/settings/makeReleaseStatusReaderFromDependencies/makeReleaseStatusReaderFromDependencies.ts";
import { SHOEBOX_VERSION } from "../../apps/server/src/version.ts";
import { test, expect } from "./admin.fixtures.ts";

[
  { name: "current", tag: `v${SHOEBOX_VERSION}`, message: "Up to date." },
  {
    name: "new release",
    tag: "v9999.0.0",
    message: "New version available: 9999.0.0.",
  },
  {
    name: "unavailable",
    tag: undefined,
    message: "Could not check for updates right now.",
  },
].forEach(({ name, tag, message }) => {
  test(`settings reports ${name} from the release endpoint`, async ({
    page,
    catalog,
  }) => {
    catalog.app.releaseStatusReader = makeReleaseStatusReaderFromDependencies({
      currentVersion: SHOEBOX_VERSION,
      request: async () => {
        return tag === undefined
          ? new Response("", { status: 503 })
          : Response.json({ tag_name: tag, draft: false, prerelease: false });
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/api/evidence/session/admin?to=/settings");
    await expect(
      page.getByText(`Version: ${SHOEBOX_VERSION}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(message);
    await expect(
      page.getByLabel("Shoebox name", { exact: true }),
    ).toBeEnabled();
  });
});
