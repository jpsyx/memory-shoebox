import type { FastifyInstance } from "fastify";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readAdminSettings } from "../settings/readAdminSettings.ts";

/** Registers the admin-only read of editable instance settings. */
export async function registerSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/settings", async (request) => {
    if (!requireViewer(request).isAdmin) {
      throw ApiError.forbidden("settings_forbidden");
    }
    return readAdminSettings(request.server.database);
  });
}
