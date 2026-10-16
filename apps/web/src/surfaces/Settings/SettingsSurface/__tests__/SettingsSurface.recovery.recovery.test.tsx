import { act, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { expect, it, vi } from "vitest";

import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/accountSurfaceTestHelpers";

import { renderSettings } from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";

import { createMeResponse } from "@/testing/createMeResponse";

import { meQueryOptions } from "@/api/me/me";
import {
  installSettingsSurfaceRecoveryTestLifecycle,
  renderExpiredSettingsRecovery,
  renderRecoverableSettingsWrite,
  SAVED_FAMILY_RESPONSE,
} from "./SettingsSurfacerecoveryTestHelpers";
installSettingsSurfaceRecoveryTestLifecycle();

it("disables name, sender and Cancel during another setting save", async () => {
  let finish = () => {};
  const waitForSave = new Promise<void>((settle) => {
    finish = settle;
  });
  renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: SAVED_FAMILY_RESPONSE,
        waitFor: waitForSave,
      },
    },
  });
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  expect(name).toHaveValue("Family");
  expect(name).toBeDisabled();
  expect(screen.getByLabelText("Sending address")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await act(async () => {
    return finish();
  });
  expect(await screen.findByText("The new name has been saved.")).toBeVisible();
});

it("keeps committed save and refresh-only recovery after leaving and returning", async () => {
  const { router, allowRefresh } = renderRecoverableSettingsWrite();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  expect(await screen.findByText("The new name has been saved.")).toBeVisible();
  expect(await screen.findByText("Account refresh unavailable.")).toBeVisible();
  expect(name).toBeDisabled();
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  await act(async () => {
    await router.navigate({ to: "/settings" });
  });
  expect(await screen.findByLabelText("Shoebox name")).toHaveValue("Family");
  expect(screen.getByLabelText("Shoebox name")).toBeDisabled();
  expect(screen.getByText("The new name has been saved.")).toBeVisible();
  allowRefresh();
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    return expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
  });
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
});

it("removes privileged controls when cached authority changes", async () => {
  const { queryClient } = renderSettings();
  await screen.findByLabelText("Shoebox name");
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    return path === "/api/bootstrap"
      ? Promise.resolve(
          Response.json({
            setup: { isRequired: false },
            account: createMeResponse({ role: "viewer" }),
            progress: null,
          }),
        )
      : original(path, init);
  });
  await act(async () => {
    queryClient.setQueryData(
      meQueryOptions.queryKey,
      createMeResponse({ role: "viewer" }),
    );
  });
  expect(
    await screen.findByText("Only an admin can manage Shoebox settings."),
  ).toBeVisible();
  expect(screen.queryByLabelText("Shoebox name")).not.toBeInTheDocument();
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(0);
});

it("keeps refresh recovery reachable when settings data expires and its reentry read fails", async () => {
  const { router, queryClient, allowRefresh, markReturning } =
    renderExpiredSettingsRecovery();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  await screen.findByText("Account refresh unavailable.");
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  queryClient.removeQueries({ queryKey: ["settings", "admin"], exact: true });
  markReturning();
  await act(async () => {
    await router.navigate({ to: "/settings" });
  });
  expect(
    await screen.findByRole("button", { name: "Retry account refresh" }),
  ).toBeEnabled();
  expect(screen.getByLabelText("Shoebox name")).toHaveValue("Family");
  expect(screen.getByLabelText("Shoebox name")).toBeDisabled();
  allowRefresh();
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
  });
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
});

it("retains a committed setting through bootstrap failure without mounting writable cached admin controls", async () => {
  const { router, allowRefresh } = renderRecoverableSettingsWrite();
  const original = vi.mocked(fetch).getMockImplementation()!;
  let failBootstrap = false;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    return path === "/api/bootstrap" && failBootstrap
      ? Response.json(
          { error: "unavailable", message: "Unavailable" },
          { status: 503 },
        )
      : original(path, init);
  });
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  await screen.findByText("Account refresh unavailable.");
  failBootstrap = true;
  await act(async () => {
    await router.invalidate();
  });
  expect(await screen.findByText("The new name has been saved.")).toBeVisible();
  expect(screen.queryByLabelText("Shoebox name")).not.toBeInTheDocument();
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
  failBootstrap = false;
  allowRefresh();
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await screen.findByLabelText("Shoebox name");
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    return expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
  });
  expect(countCallsTo({ method: "PATCH", path: "/api/settings" })).toBe(1);
});
