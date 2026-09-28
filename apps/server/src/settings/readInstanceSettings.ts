import type { Kysely } from "kysely";
import {
  getSettingValueFromStoredValue,
  type SettingKey,
  type SettingValue,
} from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";

/** The requested keys, each resolved to its stored value or its default. */
export type ResolvedSettings<Key extends SettingKey> = {
  [K in Key]: SettingValue<K>;
};

/**
 * Reads instance-scoped settings, resolving each through
 * `SETTING_DEFINITIONS`.
 *
 * **A fresh Shoebox holds zero `settings` rows and every key still answers**
 * (`data-models.md` § `settings`): a row is an override somebody wrote, never
 * a seed. `getSettingValueFromStoredValue` also swallows a corrupt row and
 * returns the default, so a bad value leaves a degraded instance rather than a
 * dead one.
 *
 * One query for every key, because the mail enqueue reads three of them on a
 * path that is already inside somebody else's transaction.
 *
 * @param options.database A Kysely handle or a transaction.
 * @param options.keys The keys to read.
 */
export async function readInstanceSettings<
  const Key extends SettingKey,
>(options: {
  database: Kysely<Database>;
  keys: readonly Key[];
}): Promise<ResolvedSettings<Key>> {
  const { keys } = options;
  const rows = await options.database
    .selectFrom("settings")
    .select(["key", "value"])
    .where("scope", "=", "instance")
    .where("key", "in", keys as readonly string[])
    .execute();

  const stored = new Map(
    rows.map((row) => {
      return [row.key, row.value];
    }),
  );
  // The cast survives because `Object.fromEntries` is typed to an index
  // signature, and TypeScript cannot infer a mapped type over a generic key
  // union from one. It now describes a finished object rather than standing in
  // for a half-built one.
  return Object.fromEntries(
    keys.map((key) => {
      return [key, getSettingValueFromStoredValue(key, stored.get(key))];
    }),
  ) as ResolvedSettings<Key>;
}
