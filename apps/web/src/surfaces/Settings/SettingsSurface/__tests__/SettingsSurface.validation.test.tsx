import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  countCallsTo,
  getBodiesSentTo,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  renderSettings,
  saved,
  SETTINGS,
} from "@/surfaces/Settings/SettingsSurface/__tests__/SettingsSurface.fixtures";
afterEach(() => {
  vi.unstubAllGlobals();
});
it("shows a readable sender validation error without sending a request or losing its draft", async () => {
  renderSettings();
  const user = userEvent.setup();
  const sender = await screen.findByLabelText("Sending address");
  await user.clear(sender);
  await user.type(sender, "invalid");
  await user.click(
    screen.getByRole("button", { name: "Save sending address" }),
  );
  expect(
    await screen.findByText("Enter a valid sending address."),
  ).toBeVisible();
  expect(sender).toHaveValue("invalid");
  expect(countCallsTo("PATCH", "/api/settings")).toBe(0);
});
it("saves selected arrangement and sender without modifying the other settings", async () => {
  renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: saved({
          pile: { arrangement: "tidy" },
          mail: { ...SETTINGS.mail },
        }),
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  await user.click(screen.getByRole("button", { name: "Save arrangement" }));
  expect(
    await screen.findByText("The arrangement has been saved."),
  ).toBeVisible();
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/settings") {
      return Response.json(
        saved({
          pile: { arrangement: "tidy" },
          mail: { ...SETTINGS.mail, fromAddress: "family@example.com" },
        }),
      );
    }
    return original(path, init);
  });
  const sender = screen.getByLabelText("Sending address");
  await user.clear(sender);
  await user.type(sender, "family@example.com");
  await user.click(
    screen.getByRole("button", { name: "Save sending address" }),
  );
  expect(
    await screen.findByText("The sending address has been saved."),
  ).toBeVisible();
  expect(sender).toHaveValue("family@example.com");
  expect(getBodiesSentTo("PATCH", "/api/settings")).toEqual([
    { pile: { arrangement: "tidy" } },
    { mail: { fromAddress: "family@example.com" } },
  ]);
});
