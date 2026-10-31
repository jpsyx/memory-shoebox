import type { Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { MemberAvatarUploadsTable } from "../db/types/identityAndAccess.types.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";

type AvatarOwnerOptions = Readonly<{
  database: Kysely<Database>;
  memberId: string;
  now: string;
}>;
type PublicationOptions = AvatarOwnerOptions &
  Readonly<{
    avatarId: string;
    outputByteSize: number;
  }>;
type RemovalOptions = AvatarOwnerOptions &
  Readonly<{
    expectedAvatarId: string | null;
  }>;

async function _getCurrentAvatarFromOwner(
  transaction: DatabaseExecutor,
  memberId: string,
): Promise<string | null> {
  const member = await transaction
    .selectFrom("members")
    .select(["avatar_id", "status"])
    .where("id", "=", memberId)
    .executeTakeFirst();
  if (member === undefined || member.status !== "active") {
    throw ApiError.notFound("avatar_upload_not_found");
  }
  return member.avatar_id;
}

async function _retireAvatar(
  transaction: DatabaseExecutor,
  avatarId: string | null,
  now: string,
): Promise<void> {
  if (avatarId === null) return;
  const avatar = await transaction
    .selectFrom("member_avatar_uploads")
    .select("storage_key")
    .where("id", "=", avatarId)
    .executeTakeFirstOrThrow();
  await transaction
    .updateTable("member_avatar_uploads")
    .set({ state: "retired" })
    .where("id", "=", avatarId)
    .execute();
  await transaction
    .insertInto("pending_object_deletions")
    .values({
      id: createId(),
      storage_key: avatar.storage_key,
      attempts: 0,
      last_error: null,
      created_at: now,
      last_attempted_at: null,
    })
    .onConflict((conflict) => {
      return conflict.column("storage_key").doNothing();
    })
    .execute();
}

function _assertPublishableUpload(
  upload: Readonly<MemberAvatarUploadsTable>,
  currentAvatarId: string | null,
  options: Readonly<PublicationOptions>,
): void {
  if (currentAvatarId !== upload.expected_avatar_id) {
    throw ApiError.conflict({ code: "avatar_changed" });
  }
  if (upload.state !== "uploading" || upload.expires_at <= options.now) {
    throw ApiError.gone("avatar_upload_expired");
  }
  if (
    !Number.isSafeInteger(options.outputByteSize) ||
    options.outputByteSize <= 0
  ) {
    throw ApiError.invalidRequest({
      outputByteSize: ["A processed image is required."],
    });
  }
}

/** Publishes an owned processed image with atomic version fencing and cleanup ownership. */
export async function publishMemberAvatar(
  options: PublicationOptions,
): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const upload = await transaction
        .selectFrom("member_avatar_uploads")
        .selectAll()
        .where("id", "=", options.avatarId)
        .where("member_id", "=", options.memberId)
        .executeTakeFirst();
      if (upload === undefined)
        throw ApiError.notFound("avatar_upload_not_found");
      const currentAvatarId = await _getCurrentAvatarFromOwner(
        transaction,
        options.memberId,
      );
      if (upload.state === "published" && currentAvatarId === upload.id) return;
      _assertPublishableUpload(upload, currentAvatarId, options);
      await transaction
        .updateTable("members")
        .set({ avatar_id: upload.id })
        .where("id", "=", options.memberId)
        .execute();
      await transaction
        .updateTable("member_avatar_uploads")
        .set({ state: "published", output_byte_size: options.outputByteSize })
        .where("id", "=", upload.id)
        .execute();
      await _retireAvatar(transaction, currentAvatarId, options.now);
    },
  });
}

/** Removes only the expected own image, rolling back if durable cleanup cannot be queued. */
export async function removeMemberAvatar(
  options: RemovalOptions,
): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const currentAvatarId = await _getCurrentAvatarFromOwner(
        transaction,
        options.memberId,
      );
      if (currentAvatarId !== options.expectedAvatarId) {
        throw ApiError.conflict({ code: "avatar_changed" });
      }
      await transaction
        .updateTable("members")
        .set({ avatar_id: null })
        .where("id", "=", options.memberId)
        .execute();
      await _retireAvatar(transaction, currentAvatarId, options.now);
    },
  });
}
