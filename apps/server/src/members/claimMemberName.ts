import {
  accountNameSchema,
  makeAccountNameKeyFromName,
} from "@memory-shoebox/shared";
import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { syncMemberPerson } from "./syncMemberPerson.ts";

type ClaimOptions = Readonly<{
  transaction: DatabaseExecutor;
  memberId: string;
  displayName: string;
  now: string;
}>;

async function _claimNameKey(options: ClaimOptions): Promise<void> {
  const { transaction, memberId, displayName, now } = options;
  const nameKey = makeAccountNameKeyFromName(displayName);
  const claim = await transaction
    .selectFrom("member_name_claims")
    .select("member_id")
    .where("name_key", "=", nameKey)
    .executeTakeFirst();
  if (claim && claim.member_id !== memberId) {
    const message =
      "That name is already taken. Try adding your last-name initial, like John M.";
    throw new ApiError({
      statusCode: 409,
      code: "name_taken",
      message,
      details: { fieldErrors: { displayName: [message] } },
    });
  }
  if (!claim) {
    await transaction
      .insertInto("member_name_claims")
      .values({
        name_key: nameKey,
        member_id: memberId,
        display_name: displayName,
        created_at: now,
      })
      .execute();
  }
}

/**
 * Claim a permanent name and synchronize identity inside the caller's
 * immediate transaction.
 */
export async function claimMemberName(options: ClaimOptions): Promise<void> {
  const { transaction, memberId, now } = options;
  const parsed = accountNameSchema.safeParse(options.displayName);
  if (!parsed.success) {
    throw ApiError.invalidRequest({
      displayName: parsed.error.issues.map((issue) => {
        return issue.message;
      }),
    });
  }
  await _claimNameKey({ ...options, displayName: parsed.data });
  await transaction
    .updateTable("members")
    .set({
      display_name: parsed.data,
      profile_completed_at: sql<string>`coalesce(profile_completed_at, ${now})`,
      suggested_display_name: null,
    })
    .where("id", "=", memberId)
    .executeTakeFirstOrThrow();
  await syncMemberPerson({ transaction, memberId, now });
}
