import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import {
  countCallsTo,
  getBodiesFromRecordedRequests,
} from "@/surfaces/Account/AccountSurface/__tests__/accountSurfaceTestHelpers";
import {
  renderSettings,
  makeSavedSettingsResponseFromOverrides,
  SETTINGS,
} from "./settingsFixtureHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("saves only the base URL and uses the saved URL for later cancellation", async () => {
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: makeSavedSettingsResponseFromOverrides({
          overrides: { public: { baseUrl: "https://family.example.com" } },
        }),
      },
    },
  });
  const user = userEvent.setup();
  const input = await screen.findByLabelText("Base URL");
  expect(input).toHaveValue("https://shoebox.example.com");
  await user.clear(input);
  await user.type(input, " https://family.example.com ");
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(0);
  await user.click(screen.getByRole("button", { name: "Save base URL" }));
  expect(await screen.findByText("The base URL has been saved.")).toBeVisible();
  await waitFor(() => {
    expect(input).toBeEnabled();
  });
  expect(input).toHaveValue("https://family.example.com");
  expect(
    getBodiesFromRecordedRequests({ method: "PATCH", path: "/api/settings" }),
  ).toEqual([{ public: { baseUrl: "https://family.example.com" } }]);
  expect(queryClient.getQueryData(publicSettingsQueryOptions.queryKey)).toEqual(
    {
      shoeboxName: "My Shoebox",
      baseUrl: "https://family.example.com",
    },
  );
  await user.type(input, "/draft");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(input).toHaveValue("https://family.example.com");
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
});

it.each(["/relative", "ftp://family.example.com", "invalid"])(
  "rejects %s without sending a request or losing the URL draft",
  async (draft) => {
    renderSettings();
    const user = userEvent.setup();
    const input = await screen.findByLabelText("Base URL");
    await user.clear(input);
    await user.type(input, draft);
    await user.click(screen.getByRole("button", { name: "Save base URL" }));
    expect(
      await screen.findByText(
        "Enter a full URL starting with http:// or https://.",
      ),
    ).toBeVisible();
    expect(input).toHaveValue(draft);
    expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(0);
  },
);

it("retains a refused URL draft and lets Cancel restore the original URL", async () => {
  renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 400,
        body: { error: "invalid_request", message: "URL refused." },
      },
    },
  });
  const user = userEvent.setup();
  const input = await screen.findByLabelText("Base URL");
  await user.clear(input);
  expect(screen.getByRole("button", { name: "Save base URL" })).toBeDisabled();
  await user.type(input, "https://family.example.com");
  await user.click(screen.getByRole("button", { name: "Save base URL" }));
  expect(await screen.findByText("URL refused.")).toBeVisible();
  expect(input).toHaveValue("https://family.example.com");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(input).toHaveValue("https://shoebox.example.com");
});

it("lets an admin fill an unset base URL", async () => {
  renderSettings({
    routes: {
      "GET /api/settings": {
        status: 200,
        body: { ...SETTINGS, public: { baseUrl: null } },
      },
    },
  });
  const user = userEvent.setup();
  const input = await screen.findByLabelText("Base URL");
  expect(input).toHaveValue("");
  await user.type(input, "http://localhost:38473");
  expect(screen.getByRole("button", { name: "Save base URL" })).toBeEnabled();
});
