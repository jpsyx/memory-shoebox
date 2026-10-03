import {
  publicSettingsResponseSchema,
  type PublicSettingsResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/**
 * Query for `GET /api/public-settings`.
 *
 * The one route an anonymous caller may reach, and it exists for exactly one
 * reason: surface 1 renders the Shoebox's name before anybody is signed in.
 * It is a fingerprint of the instance rather than a membership oracle, and it
 * serves only keys carrying `isPubliclyReadable` (`auth.md` Ruling 1).
 *
 * A signed-in member needs a different answer and gets it elsewhere:
 * `pile.arrangement` and `shoebox.timezone` ride on the session bootstrap,
 * never on a second anonymous read.
 */
export const publicSettingsQueryOptions = queryOptions({
  queryKey: ["public-settings"],
  queryFn: (): Promise<PublicSettingsResponse> => {
    return apiFetch({
      path: "/public-settings",
      schema: publicSettingsResponseSchema,
    });
  },
  staleTime: Infinity,
});
