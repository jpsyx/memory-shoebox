import { afterEach, expect, it, vi } from "vitest";
import {
  adminSettingsQueryOptions,
  updateAdminSettings,
} from "@/api/adminSettings/adminSettings";
import {
  SETTINGS,
  saved,
} from "@/surfaces/Settings/SettingsSurface/__tests__/SettingsSurface.fixtures";
afterEach(() => {
  return vi.unstubAllGlobals();
});
function reply(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json(body, { status });
    }),
  );
}
it("preserves the six resolved keys and refuses malformed settings reads", async () => {
  reply(SETTINGS);
  expect(await adminSettingsQueryOptions.queryFn!({} as never)).toEqual(
    SETTINGS,
  );
  expect(fetch).toHaveBeenCalledWith("/api/settings", expect.anything());
  reply({ ...SETTINGS, public: {} });
  await expect(
    adminSettingsQueryOptions.queryFn!({} as never),
  ).rejects.toThrow();
});
it("sends preview only in the query and strict nested fields in the body", async () => {
  reply({ ...saved(), isPreview: true });
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
  reply(saved());
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
  reply(saved());
  await expect(
    updateAdminSettings({ shoebox: { name: " " } }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  reply({ ...saved(), timezoneImpact: {} });
  await expect(
    updateAdminSettings({ pile: { arrangement: "tidy" } }),
  ).rejects.toThrow();
  reply({ error: "settings_forbidden", message: "Only admins." }, 403);
  await expect(
    updateAdminSettings({ pile: { arrangement: "tidy" } }),
  ).rejects.toMatchObject({ status: 403 });
});
it("refuses preview responses as persisted saves and save responses as previews", async () => {
  reply({ ...saved(), isPreview: true });
  await expect(
    updateAdminSettings({ shoebox: { name: "Family" } }),
  ).rejects.toThrow("unexpected preview status");
  reply(saved());
  await expect(
    updateAdminSettings({
      preview: true,
      shoebox: { timezone: "Asia/Manila" },
    }),
  ).rejects.toThrow("unexpected preview status");
});
