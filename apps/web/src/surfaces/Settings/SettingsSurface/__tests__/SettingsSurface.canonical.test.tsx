import { deferSettingsRead } from "./deferSettingsRead";

import type { GetSettingsResponse } from "@memory-shoebox/shared";

import { act, screen, waitFor, within } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { afterEach, expect, it, vi } from "vitest";

import { adminSettingsQueryOptions } from "@/api/updateAdminSettings/updateAdminSettings";

import {
  renderSettings,
  SETTINGS,
  IMPACT,
  makeSavedSettingsResponseFromOverrides,
} from "./settingsFixtureHelpers";

const FRESH: GetSettingsResponse = {
  ...SETTINGS,
  shoebox: { name: "Fresh family", timezone: "UTC" },
  pile: { arrangement: "tidy" as const },
  mail: { ...SETTINGS.mail, fromAddress: "fresh@example.com" },
};

function _renderTimezonePreview(): ReturnType<typeof renderSettings> {
  const { queryClient, router } = renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: {
          ...makeSavedSettingsResponseFromOverrides({
            overrides: {},
            impact: IMPACT,
          }),
          isPreview: true,
        },
      },
    },
  });
  return { queryClient, router };
}

async function _editAllSettings(): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  name: HTMLElement;
  sender: HTMLElement;
}> {
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Deliberate name");
  const sender = screen.getByLabelText("Sending address");
  await user.clear(sender);
  await user.type(sender, "draft@example.com");
  await user.selectOptions(
    screen.getByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  return { user, name, sender };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("refreshes all pristine fields after mounting from an older cached response", async () => {
  const { router } = renderSettings();
  await screen.findByLabelText("Shoebox name");
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  const finish = deferSettingsRead(FRESH);
  await act(async () => {
    await router.navigate({ to: "/settings" });
  });
  expect(await screen.findByLabelText("Shoebox name")).toHaveValue(
    SETTINGS.shoebox.name,
  );
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Shoebox name")).toHaveValue("Fresh family");
  });
  expect(screen.getByLabelText("Sending address")).toHaveValue(
    "fresh@example.com",
  );
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue("UTC");
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
});

it("preserves dirty text while Cancel accepts the latest canonical baseline", async () => {
  const { queryClient } = renderSettings();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "My deliberate edit");
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(name).toHaveValue("My deliberate edit");
  await user.click(
    within(
      screen.getByRole("region", { name: "The name of this Shoebox" }),
    ).getByRole("button", { name: "Cancel" }),
  );
  expect(name).toHaveValue("Fresh family");
});

it("invalidates timezone consent when a fresh saved baseline changes", async () => {
  const { queryClient } = _renderTimezonePreview();
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await screen.findByRole("button", { name: "Confirm timezone change" });
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Confirm timezone change" }),
    ).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, SETTINGS);
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Shoebox name")).toHaveValue(
      SETTINGS.shoebox.name,
    );
  });
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
});

it("defers canonical updates during a pending operation and preserves all dirty drafts", async () => {
  let finish = () => {};
  const pending = new Promise<void>((settle) => {
    finish = settle;
  });
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 503,
        body: { error: "unavailable", message: "Save unavailable" },
        waitFor: pending,
      },
    },
  });
  const { user, name, sender } = await _editAllSettings();
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(name).toBeDisabled();
  expect(name).toHaveValue("Deliberate name");
  expect(sender).toHaveValue("draft@example.com");
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(name).toBeEnabled();
  });
  await user.click(
    within(
      screen.getByRole("region", { name: "The name of this Shoebox" }),
    ).getByRole("button", { name: "Cancel" }),
  );
  expect(name).toHaveValue("Fresh family");
  expect(sender).toHaveValue("draft@example.com");
});

it("does not accept an older pending preview after its saved baseline changes", async () => {
  let finish = () => {};
  const pending = new Promise<void>((settle) => {
    finish = settle;
  });
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: {
          ...makeSavedSettingsResponseFromOverrides({
            overrides: {},
            impact: IMPACT,
          }),
          isPreview: true,
        },
        waitFor: pending,
      },
    },
  });
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toBeDisabled();
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(screen.getByLabelText("This Shoebox's timezone")).toBeEnabled();
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
});
