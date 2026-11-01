import { avatarCropSchema } from "@memory-shoebox/shared";
import type { Kysely } from "kysely";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { MemberAvatarUploadsTable } from "../db/types/identityAndAccess.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { makeAvatarImageFromBytes } from "./makeAvatarImageFromBytes.ts";
import { publishMemberAvatar } from "./memberAvatarWriteHelpers.ts";

type UploadIdentity = Readonly<{
  database: Kysely<Database>;
  memberId: string;
  avatarId: string;
  now: string;
}>;
type UploadOptions = UploadIdentity &
  Readonly<{
    b2: B2Client;
    bytes: Uint8Array;
    clock?: () => Date;
    contentType?: string;
  }>;

async function _enqueueKey(
  database: DatabaseExecutor,
  storageKey: string,
  now: string,
): Promise<void> {
  await database
    .insertInto("pending_object_deletions")
    .values({
      id: createId(),
      storage_key: storageKey,
      attempts: 0,
      last_error: null,
      created_at: now,
      last_attempted_at: null,
    })
    .onConflict((conflict) => {
      return conflict
        .column("storage_key")
        .doUpdateSet({ last_attempted_at: null });
    })
    .execute();
}

/** Retires only unpublished own work and re-arms cleanup after a late PUT. */
export async function retireMemberAvatarUpload(
  options: UploadIdentity &
    Readonly<{ storageKey?: string; reservedOnly?: boolean }>,
): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const row = await transaction
        .selectFrom("member_avatar_uploads")
        .selectAll()
        .where("id", "=", options.avatarId)
        .where("member_id", "=", options.memberId)
        .executeTakeFirst();
      if (row === undefined && options.storageKey === undefined) {
        return;
      }
      if (
        row?.state === "published" ||
        (options.reservedOnly && row?.state !== "reserved")
      ) {
        return;
      }
      const current = await transaction
        .selectFrom("members")
        .select("id")
        .where("avatar_id", "=", options.avatarId)
        .executeTakeFirst();
      if (current !== undefined) {
        return;
      }
      await transaction
        .updateTable("member_avatar_uploads")
        .set({ state: "retired" })
        .where("id", "=", options.avatarId)
        .where("member_id", "=", options.memberId)
        .execute();
      await _enqueueKey(
        transaction,
        options.storageKey ?? row!.storage_key,
        options.now,
      );
    },
  });
}

async function _claimUpload(options: UploadIdentity) {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const row = await transaction
        .selectFrom("member_avatar_uploads")
        .selectAll()
        .where("id", "=", options.avatarId)
        .where("member_id", "=", options.memberId)
        .executeTakeFirst();
      const owner = await transaction
        .selectFrom("members")
        .select(["avatar_id", "status"])
        .where("id", "=", options.memberId)
        .executeTakeFirst();
      if (row === undefined || owner?.status !== "active") {
        throw ApiError.notFound("avatar_upload_not_found");
      }
      if (row.state === "published" && owner.avatar_id === row.id) {
        return { row, isReplay: true };
      }
      if (row.state !== "reserved" || row.expires_at <= options.now) {
        throw ApiError.gone("avatar_upload_expired");
      }
      if (owner.avatar_id !== row.expected_avatar_id) {
        throw ApiError.conflict({ code: "avatar_changed" });
      }
      await transaction
        .updateTable("member_avatar_uploads")
        .set({ state: "uploading" })
        .where("id", "=", row.id)
        .where("state", "=", "reserved")
        .execute();
      return { row, isReplay: false };
    },
  });
}

/**
 * Claims, processes and publishes one immutable avatar without holding SQL
 * over I/O.
 */
export async function uploadMemberAvatar(
  options: UploadOptions,
): Promise<void> {
  const clock =
    options.clock ??
    (() => {
      return new Date();
    });
  const claimed = await _claimUpload(options).catch(async (error: unknown) => {
    await retireMemberAvatarUpload({
      ...options,
      now: clock().toISOString(),
      reservedOnly: true,
    });
    throw error;
  });
  if (claimed.isReplay) {
    return;
  }
  const { row } = claimed;
  try {
    const bytes = await _makeImageFromReservation(options, row);
    await options.b2.putObject({
      key: row.storage_key,
      body: bytes,
      contentType: "image/webp",
    });
    await publishMemberAvatar({
      ...options,
      outputByteSize: bytes.byteLength,
      now: clock().toISOString(),
    });
  } catch (error: unknown) {
    await retireMemberAvatarUpload({
      ...options,
      storageKey: row.storage_key,
      now: clock().toISOString(),
    });
    throw error;
  }
}

async function _makeImageFromReservation(
  options: UploadOptions,
  row: MemberAvatarUploadsTable,
): Promise<Uint8Array> {
  if (
    options.bytes.byteLength !== row.declared_byte_size ||
    (options.contentType !== undefined &&
      options.contentType !== row.content_type)
  ) {
    throw ApiError.invalidRequest({
      image: ["The image must match its reservation."],
    });
  }
  return makeAvatarImageFromBytes({
    bytes: options.bytes,
    contentType: row.content_type,
    crop: avatarCropSchema.parse(JSON.parse(row.crop_json)),
  });
}
