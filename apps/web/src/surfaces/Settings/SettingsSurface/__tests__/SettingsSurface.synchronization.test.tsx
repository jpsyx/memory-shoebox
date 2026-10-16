import { selectTimezone } from "@/testing/selectTimezone";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  renderSettings,
  SETTINGS,
  HEALTH,
  IMPACT,
  makeSavedSettingsResponseFromOverrides,
} from "./settingsFixtureHelpers";
import { createMeResponse } from "@/testing/createMeResponse";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("applies a saved arrangement to the actual shell and a remote update across navigation", async () => {
  const { router } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 200,
        body: makeSavedSettingsResponseFromOverrides({
          overrides: { pile: { arrangement: "tidy" } },
        }),
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  let arrangement: "tidy" | "messy" = "tidy";
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    const me = createMeResponse();
    if (path === "/api/bootstrap") {
      return Promise.resolve(
        Response.json({
          setup: { isRequired: false },
          account: {
            ...me,
            settings: { ...me.settings, pileArrangement: arrangement },
          },
          progress: { needsInvitations: false },
        }),
      );
    }
    return path === "/api/me"
      ? Promise.resolve(
          Response.json({
            ...me,
            settings: { ...me.settings, pileArrangement: arrangement },
          }),
        )
      : originalFetch(path, init);
  });
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  await user.click(screen.getByRole("button", { name: "Save arrangement" }));
  await waitFor(() => {
    return expect(
      screen.getByRole("main").closest("[data-pile]"),
    ).toHaveAttribute("data-pile", "tidy");
  });
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  arrangement = "messy";
  act(() => {
    return window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => {
    return expect(
      screen.getByRole("main").closest("[data-pile]"),
    ).toHaveAttribute("data-pile", "messy");
  });
});

it("refreshes pristine admin-only fields and health remotely while retaining a dirty name", async () => {
  renderSettings();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Unsaved family name");
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    if (path === "/api/settings") {
      return Promise.resolve(
        Response.json({
          ...SETTINGS,
          public: { baseUrl: "https://new.example.com" },
          mail: { fromName: "New family", fromAddress: "new@example.com" },
        }),
      );
    }
    if (path === "/api/mail/health") {
      return Promise.resolve(
        Response.json({
          ...HEALTH,
          status: "failing",
          diagnosis: { code: "base_url_unset", settingKey: "public.base_url" },
        }),
      );
    }
    return originalFetch(path, init);
  });
  act(() => {
    return window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => {
    return expect(screen.getByLabelText("Sending address")).toHaveValue(
      "new@example.com",
    );
  });
  expect(screen.getByLabelText("Base URL")).toHaveValue(
    "https://new.example.com",
  );
  expect(name).toHaveValue("Unsaved family name");
  await waitFor(() => {
    return expect(
      screen.getByRole("status", { name: "Mail health" }),
    ).toHaveTextContent("Mail needs attention");
  });
});

it("invalidates filters and people after committing a timezone save", async () => {
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: {
          ...makeSavedSettingsResponseFromOverrides({ impact: IMPACT }),
          isPreview: true,
        },
      },
      "PATCH /api/settings": {
        status: 200,
        body: makeSavedSettingsResponseFromOverrides({
          overrides: {
            shoebox: { ...SETTINGS.shoebox, timezone: "Asia/Manila" },
          },
          impact: IMPACT,
        }),
      },
    },
  });
  queryClient.setQueryData(["filters"], "old");
  queryClient.setQueryData(["people"], "old");
  const user = userEvent.setup();
  await selectTimezone({
    user,
    field: await screen.findByRole("combobox", {
      name: "This Shoebox's timezone",
    }),
    timezone: "Asia/Manila",
  });
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Confirm timezone change" }),
  );
  await waitFor(() => {
    return expect(queryClient.getQueryState(["filters"])?.isInvalidated).toBe(
      true,
    );
  });
  expect(queryClient.getQueryState(["people"])?.isInvalidated).toBe(true);
});

it("prevents background reads started before a save from overwriting its settings and shell", async () => {
  const saved = makeSavedSettingsResponseFromOverrides({
    overrides: { pile: { arrangement: "tidy" } },
  });
  const { queryClient } = renderSettings({
    routes: { "PATCH /api/settings": { status: 200, body: saved } },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  const oldMe = createMeResponse();
  let releaseMe = (_response: Response) => {};
  let releaseSettings = (_response: Response) => {};
  const pendingMe = new Promise<Response>((settle) => {
    releaseMe = settle;
  });
  const pendingSettings = new Promise<Response>((settle) => {
    releaseSettings = settle;
  });
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let hasReadMe = false;
  let hasReadSettings = false;
  vi.mocked(fetch).mockImplementation((path, init) => {
    if (path === "/api/bootstrap") {
      return Promise.resolve(
        Response.json({
          setup: { isRequired: false },
          account: {
            ...oldMe,
            settings: { ...oldMe.settings, pileArrangement: "tidy" },
          },
          progress: { needsInvitations: false },
        }),
      );
    }
    if (path === "/api/me") {
      if (!hasReadMe) {
        hasReadMe = true;
        return pendingMe;
      }
      return Promise.resolve(
        Response.json({
          ...oldMe,
          settings: { ...oldMe.settings, pileArrangement: "tidy" },
        }),
      );
    }
    if (
      path === "/api/settings" &&
      init?.method !== "PATCH" &&
      !hasReadSettings
    ) {
      hasReadSettings = true;
      return pendingSettings;
    }
    return originalFetch(path, init);
  });
  const { meQueryOptions } = await import("@/api/me/me");
  const { adminSettingsQueryOptions } =
    await import("@/api/updateAdminSettings/updateAdminSettings");
  const staleReads = Promise.allSettled([
    queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 }),
    queryClient.fetchQuery(adminSettingsQueryOptions),
  ]);
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  await user.click(screen.getByRole("button", { name: "Save arrangement" }));
  await screen.findByText("The arrangement has been saved.");
  await act(async () => {
    releaseMe(Response.json(oldMe));
    releaseSettings(Response.json(SETTINGS));
    await staleReads;
  });
  await waitFor(() => {
    return expect(
      queryClient.getQueryData(adminSettingsQueryOptions.queryKey)?.pile
        .arrangement,
    ).toBe("tidy");
  });
  expect(
    queryClient.getQueryData(meQueryOptions.queryKey)?.settings.pileArrangement,
  ).toBe("tidy");
  expect(screen.getByRole("main").closest("[data-pile]")).toHaveAttribute(
    "data-pile",
    "tidy",
  );
});

it("refreshes a running upload after timezone commit without losing Files or transfer state", async () => {
  const controllerModule =
    await import("@/upload/createUploadSessionController/createUploadSessionController");
  const { makeUploadControllerHarness } =
    await import("@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers");
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const uploading = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  const before = harness.controller.getSnapshot();
  const factory = vi
    .spyOn(controllerModule, "createUploadSessionController")
    .mockReturnValue(harness.controller);
  renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: {
          ...makeSavedSettingsResponseFromOverrides({ impact: IMPACT }),
          isPreview: true,
        },
      },
      "PATCH /api/settings": {
        status: 200,
        body: makeSavedSettingsResponseFromOverrides({
          overrides: {
            shoebox: { ...SETTINGS.shoebox, timezone: "Asia/Manila" },
          },
          impact: IMPACT,
        }),
      },
    },
  });
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return {
        ...file,
        capturedOn: "2026-10-12",
      };
    }),
  });
  const user = userEvent.setup();
  await selectTimezone({
    user,
    field: await screen.findByRole("combobox", {
      name: "This Shoebox's timezone",
    }),
    timezone: "Asia/Manila",
  });
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Confirm timezone change" }),
  );
  await waitFor(() => {
    return expect(
      harness.controller.getSnapshot().detail!.files[0]!.capturedOn,
    ).toBe("2026-10-12");
  });
  expect(harness.controller.getSnapshot().filesById).toBe(before.filesById);
  expect(harness.controller.getSnapshot().phase).toBe("sending");
  expect(harness.engine.cancel).not.toHaveBeenCalled();
  harness.answerRun();
  await uploading;
  factory.mockRestore();
});
