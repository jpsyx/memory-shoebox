import type { AdminVisualCase } from "./visual.types.ts";
/** Seeds historical changes before the first production page is loaded. */
export async function seedAdminVisualHistory({
  catalog,
  surface,
  state,
}: Readonly<AdminVisualCase>): Promise<void> {
  if (surface === "changes" && state !== "empty") {
    const headers = { cookie: catalog.admin.cookie };
    await catalog.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers,
      payload: { shoebox: { name: "The Ruiz Shoebox" } },
    });
    await catalog.app.inject({
      method: "PATCH",
      url: `/api/members/${catalog.secondAdmin}`,
      headers,
      payload: { role: "uploader" },
    });
    await catalog.app.inject({
      method: "DELETE",
      url: "/api/items/00000000-0000-4000-8000-000000000010",
      headers,
    });
  }
}
