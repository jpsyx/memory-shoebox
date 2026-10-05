import { afterEach, expect, it, vi } from "vitest";
import {
  adminSettingsQueryOptions,
  updateAdminSettings,
} from "@/api/updateAdminSettings/updateAdminSettings";
import {
  SETTINGS,
  makeSavedSettingsResponseFromOverrides,
} from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";
afterEach(() => {
  return vi.unstubAllGlobals();
});
function _reply({
  body,
  status = 200,
}: Readonly<{ body: unknown; status?: number }>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json(body, { status });
    }),
  );
}
it("preserves the six resolved keys and refuses malformed settings reads", async () => {
  _reply({
    body: SETTINGS,
  });
  expect(await adminSettingsQueryOptions.queryFn!({} as never)).toEqual(
    SETTINGS,
  );
  expect(fetch).toHaveBeenCalledWith("/api/settings", expect.anything());
  _reply({
    body: { ...SETTINGS, public: {} },
  });
  await expect(
    adminSettingsQueryOptions.queryFn!({} as never),
  ).rejects.toThrow();
});
it("sends preview only in the query and strict nested fields in the body", async () => {
  _reply({
    body: { ...makeSavedSettingsResponseFromOverrides(), isPreview: true },
  });
  await updateAdminSettings({
    preview: true,
    shoebox: { timezone: "Asia/Manila" },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/settings?preview=true",
    expect.objectContaining({
      method: "PATCH",
      body: '{"shoebox":{"timezone":"Asia/Manila"}}',
    }),
  );
  _reply({
    body: makeSavedSettingsResponseFromOverrides(),
  });
  await updateAdminSettings({
    preview: false,
    shoebox: { name: " Family " },
    pile: { arrangement: "tidy" },
    mail: { fromAddress: "family@example.com", fromName: "Family" },
    public: { baseUrl: "https://family.example.com" },
  });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/settings?preview=false",
    expect.objectContaining({
      body: '{"shoebox":{"name":"Family"},"pile":{"arrangement":"tidy"},"mail":{"fromAddress":"family@example.com","fromName":"Family"},"public":{"baseUrl":"https://family.example.com"}}',
    }),
  );
});
it("refuses invalid input before a request and rejects invalid write responses", async () => {
  _reply({
    body: makeSavedSettingsResponseFromOverrides(),
  });
  await expect(
    updateAdminSettings({ shoebox: { name: " " } }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  _reply({
    body: { ...makeSavedSettingsResponseFromOverrides(), timezoneImpact: {} },
  });
  await expect(
    updateAdminSettings({ pile: { arrangement: "tidy" } }),
  ).rejects.toThrow();
  _reply({
    body: { error: "settings_forbidden", message: "Only admins." },
    status: 403,
  });
  await expect(
    updateAdminSettings({ pile: { arrangement: "tidy" } }),
  ).rejects.toMatchObject({ status: 403 });
});
it("refuses preview responses as persisted saves and save responses as previews", async () => {
  _reply({
    body: { ...makeSavedSettingsResponseFromOverrides(), isPreview: true },
  });
  await expect(
    updateAdminSettings({ shoebox: { name: "Family" } }),
  ).rejects.toThrow("unexpected preview status");
  _reply({
    body: makeSavedSettingsResponseFromOverrides(),
  });
  await expect(
    updateAdminSettings({
      preview: true,
      shoebox: { timezone: "Asia/Manila" },
    }),
  ).rejects.toThrow("unexpected preview status");
});
