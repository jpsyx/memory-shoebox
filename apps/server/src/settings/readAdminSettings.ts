import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { readMemberAvatars } from "../avatars/readMemberAvatars.ts";
import {
  type AvatarRef,
  EDITABLE_INSTANCE_SETTING_KEYS,
  getSettingValueFromStoredValue,
  type GetSettingsResponse,
  type ResolvedSettings,
} from "@memory-shoebox/shared";
import { SHOEBOX_VERSION } from "../version.ts";
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
  avatars: ReadonlyMap<string, AvatarRef>,
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
          : {
              memberId: row.memberId,
              displayName: row.displayName ?? "",
              avatar: avatars.get(row.memberId) ?? null,
            };
      return [{ key, updatedAt: row.updated_at, updatedBy }];
    }),
  };
}

/** Reads editable values, provenance, catalog totals and deployed version. */
export async function readAdminSettings(
  options: Readonly<{ database: DatabaseExecutor; b2: B2Client; now: string }>,
): Promise<GetSettingsResponse> {
  const { database } = options;
  const rows = await _readSettingRows(database);
  const avatars = await readMemberAvatars({
    ...options,
    memberIds: rows.flatMap((row) => {
      return row.memberId === null ? [] : [row.memberId];
    }),
  });
  return {
    ..._getResolvedSettingsFromRows(rows),
    ..._getProvenanceFromRows(rows, avatars),
    storage: await _readStorage(database),
    version: SHOEBOX_VERSION,
  };
}
