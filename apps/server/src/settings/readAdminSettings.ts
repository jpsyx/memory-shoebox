import {
  EDITABLE_INSTANCE_SETTING_KEYS,
  getSettingValueFromStoredValue,
  type GetSettingsResponse,
  type ResolvedSettings,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

type SettingRow = {
  key: string;
  value: string;
  updated_at: string;
  memberId: string | null;
  displayName: string | null;
};

async function _readSettingRows(
  database: DatabaseExecutor,
): Promise<SettingRow[]> {
  return database
    .selectFrom("settings")
    .leftJoin("members", "members.id", "settings.updated_by_member_id")
    .select([
      "settings.key",
      "settings.value",
      "settings.updated_at",
      "members.id as memberId",
      "members.display_name as displayName",
    ])
    .where("settings.scope", "=", "instance")
    .where("settings.key", "in", EDITABLE_INSTANCE_SETTING_KEYS)
    .execute();
}

async function _readStorage(
  database: DatabaseExecutor,
): Promise<GetSettingsResponse["storage"]> {
  const storage = await database
    .selectFrom("items")
    .select(({ fn }) => {
      return [
        fn.countAll<number>().as("itemCount"),
        fn.sum<number>("byte_size").as("byteSize"),
      ];
    })
    .executeTakeFirstOrThrow();
  return {
    itemCount: Number(storage.itemCount),
    byteSize: Number(storage.byteSize ?? 0),
  };
}

function _getResolvedSettingsFromRows(
  rows: readonly SettingRow[],
): ResolvedSettings {
  const stored = new Map(
    rows.map((row) => {
      return [row.key, row.value];
    }),
  );
  const value = <Key extends (typeof EDITABLE_INSTANCE_SETTING_KEYS)[number]>(
    key: Key,
  ) => {
    return getSettingValueFromStoredValue(key, stored.get(key));
  };
  return {
    shoebox: {
      name: value("shoebox.name"),
      timezone: value("shoebox.timezone"),
    },
    pile: { arrangement: value("pile.arrangement") },
    mail: {
      fromAddress: value("mail.from_address"),
      fromName: value("mail.from_name"),
    },
    public: { baseUrl: value("public.base_url") },
  };
}

function _getProvenanceFromRows(
  rows: readonly SettingRow[],
): Pick<GetSettingsResponse, "changedBy" | "defaultedKeys"> {
  const stored = new Map(
    rows.map((row) => {
      return [row.key, row];
    }),
  );
  return {
    defaultedKeys: EDITABLE_INSTANCE_SETTING_KEYS.filter((key) => {
      return !stored.has(key);
    }),
    changedBy: EDITABLE_INSTANCE_SETTING_KEYS.flatMap((key) => {
      const row = stored.get(key);
      if (row === undefined) {
        return [];
      }
      const updatedBy =
        row.memberId === null
          ? null
          : { memberId: row.memberId, displayName: row.displayName ?? "" };
      return [{ key, updatedAt: row.updated_at, updatedBy }];
    }),
  };
}

/** Reads editable values and provenance in one batch, plus catalog totals. */
export async function readAdminSettings(
  database: DatabaseExecutor,
): Promise<GetSettingsResponse> {
  const rows = await _readSettingRows(database);
  return {
    ..._getResolvedSettingsFromRows(rows),
    ..._getProvenanceFromRows(rows),
    storage: await _readStorage(database),
  };
}
