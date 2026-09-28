import type { Kysely } from "kysely";
import type { ShellSettings } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "./readInstanceSettings.ts";

/**
 * The three resolved values the app shell needs as it renders.
 *
 * They ride on `POST /api/auth/session` and on `GET /api/me` rather than on a
 * second fetch (`auth.md` Ruling 1), which is also why `pile.arrangement` can
 * stay out of the anonymous `GET /api/public-settings`.
 *
 * @param database A Kysely handle or a transaction.
 */
export async function readShellSettings(
  database: Kysely<Database>,
): Promise<ShellSettings> {
  const settings = await readInstanceSettings({
    database,
    keys: ["shoebox.name", "pile.arrangement", "shoebox.timezone"],
  });
  return {
    shoeboxName: settings["shoebox.name"],
    pileArrangement: settings["pile.arrangement"],
    timezone: settings["shoebox.timezone"],
  };
}
