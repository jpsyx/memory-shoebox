import type { AvatarRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";

type AvatarReadOptions = Readonly<{
  database: DatabaseExecutor;
  b2: B2Client;
  memberIds: readonly string[];
  now: string;
}>;
type AvatarRow = Readonly<{
  memberId: string;
  avatarId: string;
  storageKey: string;
}>;

async function _signAvatarFromRow(
  options: AvatarReadOptions,
  row: AvatarRow,
): Promise<[string, AvatarRef]> {
  const signingDate = new Date(
    Math.floor(Date.parse(options.now) / 1000) * 1000,
  );
  const url = await options.b2.presignGet({
    key: row.storageKey,
    expiresInSeconds: 3600,
    now: signingDate,
  });
  return [
    row.memberId,
    {
      avatarId: row.avatarId,
      url,
      issuedAt: signingDate.toISOString(),
      expiresAt: new Date(signingDate.getTime() + 3600000).toISOString(),
    },
  ];
}

/** Batches current metadata and signs private keys using the exact whole-second signing clock. */
export async function readMemberAvatars(
  options: AvatarReadOptions,
): Promise<Map<string, AvatarRef>> {
  if (options.memberIds.length === 0) return new Map();
  const rows = await options.database
    .selectFrom("members")
    .innerJoin(
      "member_avatar_uploads",
      "member_avatar_uploads.id",
      "members.avatar_id",
    )
    .select([
      "members.id as memberId",
      "member_avatar_uploads.id as avatarId",
      "member_avatar_uploads.storage_key as storageKey",
    ])
    .where("members.id", "in", [...new Set(options.memberIds)])
    .where("member_avatar_uploads.state", "=", "published")
    .execute();
  const entries = await Promise.all(
    rows.map((row) => {
      return _signAvatarFromRow(options, row);
    }),
  );
  return new Map(entries);
}
