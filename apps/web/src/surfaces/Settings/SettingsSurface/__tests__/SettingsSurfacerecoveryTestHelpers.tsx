import { afterEach, vi } from "vitest";

import {
  makeSavedSettingsResponseFromOverrides,
  renderSettings,
  SETTINGS,
} from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";

/** Shared scenario fixture. */
export type ExpiredSettingsRecovery = ReturnType<typeof renderSettings> & {
  allowRefresh: () => void;
  markReturning: () => void;
};
/** Shared scenario fixture. */
export const SAVED_FAMILY_RESPONSE: ReturnType<
  typeof makeSavedSettingsResponseFromOverrides
> = makeSavedSettingsResponseFromOverrides({
  overrides: { shoebox: { ...SETTINGS.shoebox, name: "Family" } },
});
/** Shared scenario fixture. */
export function renderExpiredSettingsRecovery(): ExpiredSettingsRecovery {
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
/** Shared scenario fixture. */
export function renderRecoverableSettingsWrite(): {
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
/** Registers the owned scenario setup and cleanup. */
export function installSettingsSurfaceRecoveryTestLifecycle(): void {
  afterEach(() => {
    return vi.unstubAllGlobals();
  });
}
