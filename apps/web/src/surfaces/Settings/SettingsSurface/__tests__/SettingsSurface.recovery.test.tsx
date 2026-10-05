import { act, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { afterEach, expect, it, vi } from "vitest";

import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

import {
  renderSettings,
  makeSavedSettingsResponseFromOverrides,
  SETTINGS,
  HEALTH,
} from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";

import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtures";

import { createMeResponse } from "@/testing/createMeResponse";

import { meQueryOptions } from "@/api/me/me";
type ExpiredSettingsRecovery = ReturnType<typeof renderSettings> & {
  allowRefresh: () => void;
  markReturning: () => void;
};

const SAVED_FAMILY_RESPONSE: ReturnType<
  typeof makeSavedSettingsResponseFromOverrides
> = makeSavedSettingsResponseFromOverrides({
  overrides: { shoebox: { ...SETTINGS.shoebox, name: "Family" } },
});

function _renderExpiredSettingsRecovery(): ExpiredSettingsRecovery {
  const { router, queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: SAVED_FAMILY_RESPONSE,
      },
    },
  });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let hasWritten = false;
  let isReturning = false;
  let allowRefresh = false;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/settings" && init?.method === "PATCH") {
      hasWritten = true;
    }
    if (path === "/api/me" && hasWritten && !allowRefresh) {
      return Response.json(
        { error: "unavailable", message: "Account refresh unavailable." },
        { status: 503 },
      );
    }
    if (path === "/api/settings" && init?.method !== "PATCH" && isReturning) {
      return allowRefresh
        ? Response.json(SAVED_FAMILY_RESPONSE)
        : Response.json(
            { error: "unavailable", message: "Settings read unavailable." },
            { status: 503 },
          );
    }
    return original(path, init);
  });
  return {
    router,
    queryClient,
    allowRefresh: () => {
      allowRefresh = true;
    },
    markReturning: () => {
      isReturning = true;
    },
  };
}

function _renderRecoverableSettingsWrite(): {
  router: ReturnType<typeof renderSettings>["router"];
  allowRefresh: () => void;
} {
  const { router } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: SAVED_FAMILY_RESPONSE,
      },
    },
  });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let hasWritten = false;
  let allowRefresh = false;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/settings" && init?.method === "PATCH") {
      hasWritten = true;
    }
    if (path === "/api/me" && hasWritten && !allowRefresh) {
      return Response.json(
        { error: "unavailable", message: "Account refresh unavailable." },
        { status: 503 },
      );
    }
    if (path === "/api/settings" && hasWritten && init?.method !== "PATCH") {
      return Response.json(SAVED_FAMILY_RESPONSE);
    }
    return original(path, init);
  });
  return {
    router,
    allowRefresh: () => {
      allowRefresh = true;
    },
  };
}

afterEach(() => {
  return vi.unstubAllGlobals();
});

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
  const { router, allowRefresh } = _renderRecoverableSettingsWrite();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Family");
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  expect(await screen.findByText("The new name has been saved.")).toBeVisible();
  expect(await screen.findByText("Account refresh unavailable.")).toBeVisible();
  expect(name).toBeDisabled();
  expect(countCallsTo("PATCH", "/api/settings")).toBe(1);
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
  expect(countCallsTo("PATCH", "/api/settings")).toBe(1);
});

it("shows a passive real photo miniature without new navigation controls", async () => {
  renderSettings({
    routes: {
      "GET /api/timeline": {
        status: 200,
        body: {
          days: [
            makeDay({
              items: [
                makeItem({
                  media: { ...makeItem().media, altText: "Family picnic" },
                }),
              ],
            }),
          ],
          nextCursor: null,
          resultCount: null,
        },
      },
    },
  });
  expect(await screen.findByAltText("Family picnic")).toHaveAttribute(
    "src",
    "https://example.invalid/thumb.jpg",
  );
  expect(
    screen.getByAltText("Family picnic").closest("[inert]"),
  ).not.toBeNull();
});

it("removes privileged controls when cached authority changes", async () => {
  const { queryClient } = renderSettings();
  await screen.findByLabelText("Shoebox name");
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
  expect(countCallsTo("PATCH", "/api/settings")).toBe(0);
});

it("shows global and inline safe mail diagnosis and rereads health without claiming a test send", async () => {
  renderSettings({
    routes: {
      "GET /api/mail/health": {
        status: 200,
        body: {
          ...HEALTH,
          status: "failing",
          diagnosis: {
            code: "domain_unverified",
            domain: "example.com",
            providerError: "Domain verification is unavailable.",
          },
        },
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  expect(await screen.findByText("Mail needs attention.")).toBeVisible();
  expect(screen.getAllByText(/example.com is not verified/)).toHaveLength(2);
  expect(screen.getByText(/60 seconds/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Recheck mail health" }));
  await waitFor(() => {
    return expect(countCallsTo("GET", "/api/mail/health")).toBe(2);
  });
  expect(countCallsTo("POST", "/api/mail/test")).toBe(0);
  expect(screen.queryByText(/Test sent/)).not.toBeInTheDocument();
});

it.each([
  [
    { code: "base_url_unset", settingKey: "public.base_url" },
    /PUBLIC_BASE_URL/,
  ],
  [
    { code: "from_address_unset", settingKey: "mail.from_address" },
    /Set a sending address/,
  ],
  [
    {
      code: "provider_rejecting",
      providerStatus: "403",
      providerMessage: "Mail provider refused the message.",
      failingSince: "2026-10-01T10:00:00.000Z",
    },
    /403/,
  ],
  [
    {
      code: "backlog",
      queuedCount: 12,
      oldestQueuedAt: "2026-10-01T10:00:00.000Z",
    },
    /12 messages/,
  ],
])("explains the real mail cause %j", async (diagnosis, expected) => {
  renderSettings({
    routes: {
      "GET /api/mail/health": {
        status: 200,
        body: { ...HEALTH, status: "failing", diagnosis },
      },
    },
  });
  await screen.findByLabelText("Shoebox name");
  expect(await screen.findAllByText(expected)).not.toHaveLength(0);
});

it("keeps refresh recovery reachable when settings data expires and its reentry read fails", async () => {
  const { router, queryClient, allowRefresh, markReturning } =
    _renderExpiredSettingsRecovery();
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
  expect(countCallsTo("PATCH", "/api/settings")).toBe(1);
});
