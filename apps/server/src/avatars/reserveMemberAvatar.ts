import type { Kysely } from "kysely";
import {
  reserveAvatarRequestSchema,
  type ReserveAvatarRequest,
  type ReserveAvatarResponse,
} from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";

type ReserveOptions = Readonly<{
  database: Kysely<Database>;
  memberId: string;
  body: ReserveAvatarRequest;
  now: string;
}>;

/** Reserves a new immutable key under the owner's current avatar version. */
export async function reserveMemberAvatar(
  options: ReserveOptions,
): Promise<ReserveAvatarResponse> {
  const body = reserveAvatarRequestSchema.parse(options.body);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const member = await transaction
        .selectFrom("members")
        .select(["avatar_id", "status"])
        .where("id", "=", options.memberId)
        .executeTakeFirst();
      if (member === undefined || member.status !== "active")
        throw ApiError.notFound("member_not_found");
      if (member.avatar_id !== body.expectedAvatarId)
        throw ApiError.conflict({ code: "avatar_changed" });
      const avatarId = createId();
      const expiresAt = new Date(
        Date.parse(options.now) + 600000,
      ).toISOString();
      await _insertReservation(
        { ...options, database: transaction, body },
        { avatarId, expiresAt },
      );
      return { avatarId, expiresAt };
    },
  });
}

async function _insertReservation(
  options: ReserveOptions,
  reservation: ReserveAvatarResponse,
): Promise<void> {
  const { avatarId, expiresAt } = reservation;
  const { body } = options;
  await options.database
    .insertInto("member_avatar_uploads")
    .values({
      id: avatarId,
      member_id: options.memberId,
      storage_key: `avatars/${options.memberId}/${avatarId}.webp`,
      expected_avatar_id: body.expectedAvatarId,
      crop_json: JSON.stringify(body.crop),
      content_type: body.contentType,
      declared_byte_size: body.byteSize,
      output_byte_size: null,
      state: "reserved",
      expires_at: expiresAt,
      created_at: options.now,
    })
    .execute();
}
