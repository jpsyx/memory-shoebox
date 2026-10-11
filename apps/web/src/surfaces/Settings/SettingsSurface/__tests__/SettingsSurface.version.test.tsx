import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import { renderSettings } from "./settingsFixtureHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  ["up_to_date", "2.4.1", "Up to date."],
  ["update_available", "2.5.0", "New version available: 2.5.0."],
  ["unavailable", null, "Could not check for updates right now."],
])(
  "shows %s beside the installed version",
  async (status, latestVersion, message) => {
    renderSettings({
      routes: {
        "GET /api/settings/version": {
          status: 200,
          body: {
            status,
            latestVersion,
            checkedAt:
              status === "unavailable" ? null : "2026-10-11T00:00:00.000Z",
          },
        },
      },
    });
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByText("Version: 2.4.1")).toBeVisible();
    expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
  },
);

it("keeps settings usable when the version request fails", async () => {
  renderSettings({
    routes: {
      "GET /api/settings/version": {
        status: 503,
        body: { error: "unavailable", message: "Unavailable" },
      },
    },
  });
  expect(
    await screen.findByText("Could not check for updates right now."),
  ).toBeVisible();
  expect(screen.queryByText("Up to date.")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
});

it.each(["viewer", "uploader"] as const)(
  "does not check releases for %s",
  async (role) => {
    renderSettings({ role });
    await screen.findByText("Only an admin can manage Shoebox settings.");
    expect(countCallsTo("GET", "/api/settings/version")).toBe(0);
  },
);
