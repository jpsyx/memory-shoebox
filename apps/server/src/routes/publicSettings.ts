import type { FastifyInstance } from "fastify";
import {
  PUBLIC_SETTING_KEYS,
  type PublicSettingsResponse,
} from "@memory-shoebox/shared";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";

/**
 * `GET /api/public-settings`: the Shoebox's name before anybody is signed in.
 *
 * It belongs to the administration slice beside `GET /api/settings`, which
 * stays admin-only because it also carries the mail configuration and the
 * storage figures (`administration.md`). It lives in its own module here
 * because the sign-in page is what needs it and the rest of that slice is
 * step 8a's.
 *
 * **A fingerprint, not an oracle.** Anybody who can reach the instance learns
 * what it calls itself, which is the same thing the sign-in page shows them
 * anyway. It reveals no member, no address, no count and no content, and it
 * does nothing to weaken surface 1's `unknown` state.
 *
 * There is no 401 by definition and no 404: a Shoebox with no `shoebox.name`
 * row serves the registry's default, which is what lets a fresh instance hold
 * zero settings rows and still render.
 */
export async function publicSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/public-settings",
    { config: { rateLimit: ["publicReadPerIp"] } },
    async (request): Promise<PublicSettingsResponse> => {
      // The keys carrying `isPubliclyReadable`, and only those. The list is
      // asserted against the flag in `packages/shared/test/settings.test.ts`,
      // which is what makes the allow-list a guard rather than a habit.
      const settings = await readInstanceSettings({
        database: request.server.database,
        keys: PUBLIC_SETTING_KEYS,
      });
      return {
        shoeboxName: settings["shoebox.name"],
        baseUrl: settings["public.base_url"],
      };
    },
  );
}
