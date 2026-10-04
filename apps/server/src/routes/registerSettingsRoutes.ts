import { z } from "zod";
import { updateAdminSettings } from "../settings/updateAdminSettings.ts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readAdminSettings } from "../settings/readAdminSettings.ts";

/** Registers admin-only settings reads, previews and atomic writes. */
export async function registerSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.patch("/settings", async (request) => {
    const viewer = requireViewer(request);
    if (!viewer.isAdmin) {
      throw ApiError.forbidden("settings_forbidden");
    }
    const query = z
      .strictObject({ preview: z.enum(["true", "false"]).optional() })
      .parse(request.query);
    return updateAdminSettings({
      database: request.server.database,
      viewer,
      body: request.body as Parameters<typeof updateAdminSettings>[0]["body"],
      isPreview: query.preview === "true",
      now: request.server.clock().toISOString(),
    });
  });
  app.get("/settings", async (request) => {
    if (!requireViewer(request).isAdmin) {
      throw ApiError.forbidden("settings_forbidden");
    }
    return readAdminSettings(request.server.database);
  });
}
