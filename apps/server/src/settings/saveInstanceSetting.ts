import { sql } from "kysely";
import type { SettingKey, SettingValue } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

type SaveInstanceSettingOptions<Key extends SettingKey> = {
  transaction: DatabaseExecutor;
  key: Key;
  value: SettingValue<Key>;
  memberId: string | undefined;
  now: string;
};

/** Upserts one override; the caller owns the transaction and audit event. */
export async function saveInstanceSetting<Key extends SettingKey>(
  options: Readonly<SaveInstanceSettingOptions<Key>>,
): Promise<void> {
  const changed = {
    value: JSON.stringify(options.value),
    updated_at: options.now,
    updated_by_member_id: options.memberId ?? null,
  };
  await options.transaction
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: options.key,
      ...changed,
    })
    .onConflict((conflict) => {
      return conflict
        .column("key")
        .where("scope", "=", sql.lit("instance"))
        .doUpdateSet(changed);
    })
    .execute();
}
