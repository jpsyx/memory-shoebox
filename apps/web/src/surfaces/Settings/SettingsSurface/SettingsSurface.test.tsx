import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  countCallsTo,
  getBodiesSentTo,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  SETTINGS,
  IMPACT,
  renderSettings,
  saved,
} from "@/surfaces/Settings/SettingsSurface/__tests__/SettingsSurface.fixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { meQueryOptions } from "@/api/me/me";
afterEach(() => {
  return vi.unstubAllGlobals();
});
it("loads the five drawn sheets, real storage totals and full timezone choices without new forms", async () => {
  renderSettings();
  expect(await screen.findByLabelText("Shoebox name")).toHaveValue(
    "My Shoebox",
  );
  expect(screen.getByLabelText("Sending address")).toHaveValue(
    "shoebox@example.com",
  );
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(
    screen.getByRole("link", { name: "Back to my account" }),
  ).toHaveAttribute("href", "/account");
  expect(screen.getAllByRole("region")).toHaveLength(5);
  expect(screen.getByText(/2,147 files, 61.4 GB/)).toBeVisible();
  expect(
    within(screen.getByLabelText("This Shoebox's timezone")).getAllByRole(
      "option",
    ).length,
  ).toBeGreaterThan(300);
  expect(
    screen.getByRole("option", { name: "Pacific/Chatham" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Send myself a test/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText(/Sender name|Public URL/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save the new name" }),
  ).not.toBeInTheDocument();
});
it("saves an edited name explicitly and cancels to the saved name", async () => {
  renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: saved({ shoebox: { ...SETTINGS.shoebox, name: "Family" } }),
      },
    },
  });
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  expect(await screen.findByText("The new name has been saved.")).toBeVisible();
  expect(getBodiesSentTo("PATCH", "/api/settings")).toEqual([
    { shoebox: { name: "Family" } },
  ]);
  await user.type(name, " draft");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(name).toHaveValue("Family");
});
it("saves arrangement and sender separately with the selected draft retained on refusal", async () => {
  renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 400,
        body: { error: "invalid_request", message: "Sender refused." },
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  await user.click(screen.getByRole("button", { name: "Save arrangement" }));
  expect(await screen.findByText("Sender refused.")).toBeVisible();
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
  const sender = screen.getByLabelText("Sending address");
  await user.clear(sender);
  await user.type(sender, "family@example.com");
  await user.click(
    screen.getByRole("button", { name: "Save sending address" }),
  );
  expect(await screen.findAllByText("Sender refused.")).toHaveLength(2);
  expect(sender).toHaveValue("family@example.com");
  expect(getBodiesSentTo("PATCH", "/api/settings")).toEqual([
    { pile: { arrangement: "tidy" } },
    { mail: { fromAddress: "family@example.com" } },
  ]);
});
it("requires preview then deliberate confirmation and displays recomputed save impact and fix links", async () => {
  const actualImpact = {
    ...IMPACT,
    movingItemCount: 36,
    burstEjectionItemCount: 4,
  };
  renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: { ...saved({}, IMPACT), isPreview: true },
      },
      "PATCH /api/settings": {
        status: 200,
        body: saved(
          { shoebox: { ...SETTINGS.shoebox, timezone: "Asia/Manila" } },
          actualImpact,
        ),
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  await user.selectOptions(
    screen.getByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  expect(await screen.findByText(/34 items would move/)).toBeVisible();
  expect(screen.getByText(/3 items would leave their bursts/)).toBeVisible();
  expect(countCallsTo("PATCH", "/api/settings")).toBe(0);
  await user.click(
    screen.getByRole("button", { name: "Confirm timezone change" }),
  );
  expect(await screen.findByText(/36 items moved/)).toBeVisible();
  expect(screen.getByText(/4 items left their bursts/)).toBeVisible();
  expect(screen.getByRole("link", { name: /Birthday/ })).toHaveAttribute(
    "href",
    `/milestones?milestone=${IMPACT.milestoneMismatches[0]!.milestone.milestoneId}&mode=fix`,
  );
});
it("clears a preview on candidate change and never saves when preview fails", async () => {
  renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: { ...saved({}, IMPACT), isPreview: true },
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  const zone = screen.getByLabelText("This Shoebox's timezone");
  await user.selectOptions(zone, "Asia/Manila");
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await screen.findByRole("button", { name: "Confirm timezone change" });
  await user.selectOptions(zone, "Pacific/Chatham");
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    return path === "/api/settings?preview=true"
      ? Promise.resolve(
          Response.json(
            { error: "unavailable", message: "Preview unavailable." },
            { status: 503 },
          ),
        )
      : original(path, init);
  });
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  expect(await screen.findByText("Preview unavailable.")).toBeVisible();
  expect(zone).toHaveValue("Pacific/Chatham");
  expect(countCallsTo("PATCH", "/api/settings")).toBe(0);
});
it("does not read admin payloads for viewers or permit a write after cached authority changes", async () => {
  const { queryClient } = renderSettings({ role: "viewer" });
  await screen.findByText("Only an admin can manage Shoebox settings.");
  expect(countCallsTo("GET", "/api/settings")).toBe(0);
  expect(countCallsTo("GET", "/api/mail/health")).toBe(0);
  await act(async () => {
    return queryClient.setQueryData(
      meQueryOptions.queryKey,
      createMeResponse({ role: "viewer" }),
    );
  });
  expect(countCallsTo("PATCH", "/api/settings")).toBe(0);
});
it("recovers a failed settings read through Retry", async () => {
  renderSettings({
    routes: {
      "GET /api/settings": {
        status: 503,
        body: { error: "unavailable", message: "Settings unavailable." },
      },
    },
  });
  const user = userEvent.setup();
  expect(await screen.findByText("Settings unavailable.")).toBeVisible();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    return path === "/api/settings"
      ? Promise.resolve(Response.json(SETTINGS))
      : original(path, init);
  });
  await user.click(screen.getByRole("button", { name: "Retry settings" }));
  expect(await screen.findByLabelText("Shoebox name")).toHaveValue(
    "My Shoebox",
  );
});
