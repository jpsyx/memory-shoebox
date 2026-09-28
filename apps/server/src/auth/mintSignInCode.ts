import type { Kysely } from "kysely";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";
import { enqueueEmail } from "../mail/enqueueEmail.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import {
  SIGN_IN_CODE_LIFETIME_MINUTES,
  SIGN_IN_CODE_MAX_ATTEMPTS,
} from "./auth.constants.ts";
import {
  createSignInCodeDigits,
  makeCodeHashFromDigits,
} from "./signInCodeHelpers.ts";

/** What one mint wrote. */
export type MintedSignInCode = {
  codeId: string;
  /** The six digits, in the clear. They exist in memory and in the email. */
  digits: string;
  expiresAt: string;
};

/** Everything a mint needs. */
export type MintSignInCodeInput = {
  /**
   * The caller's transaction. The supersede, the insert and the enqueue are
   * one unit, or a second code can be live beside the first.
   */
  transaction: Kysely<Database>;
  /** Already normalised by `normalisedEmailSchema`. */
  email: string;
  pepper: Buffer;
  now: string;
};

/**
 * Supersedes whatever was live for an address and issues a fresh code.
 *
 * **One code path for every address**, member or not
 * (`data-models.md` § `sign_in_codes`). A row is written whether or not the
 * address belongs to anybody, because the unknown address has to be
 * indistinguishable from the known one through the wrong-code and resend
 * states too, not just the first screen. That also gives one timing profile
 * and one place to rate-limit.
 *
 * **Nothing is mailed when there is no usable member.** A removed member is
 * treated exactly as an unknown address (`data-models.md` § Removing a
 * member), and the difference between the branches is one local `INSERT`,
 * which is below network jitter.
 *
 * The enqueue **ignores `email_suppressions` and all four `notify_on_*`
 * columns** (Decision 16): a suppressed address still gets sign-in codes and
 * they cannot be turned off, because without them there is no way back in. The
 * worker's suppression check is already skipped for, and only for, this kind.
 *
 * Three callers: the request route, the resend route, and the third wrong
 * attempt, which `auth.md` Ruling 2 requires to mint a replacement.
 *
 * @param options.transaction The caller's transaction.
 * @param options.email Already normalised by `normalisedEmailSchema`.
 * @param options.pepper `config.signInCodePepper`.
 * @param options.now The caller's current time, from the injectable clock.
 */
export async function mintSignInCode(
  options: MintSignInCodeInput,
): Promise<MintedSignInCode> {
  const { transaction, email, now } = options;

  // At most one code is ever live per address, and "the old one has stopped
  // working" is a state on the row rather than an inference from expiry.
  await transaction
    .updateTable("sign_in_codes")
    .set({ invalidated_at: now })
    .where("email", "=", email)
    .where("consumed_at", "is", null)
    .where("invalidated_at", "is", null)
    .where("expires_at", ">", now)
    .execute();

  const member = await transaction
    .selectFrom("members")
    .select(["id", "email", "display_name", "status"])
    .where("email", "=", email)
    .executeTakeFirst();

  const digits = createSignInCodeDigits();
  const codeId = createId();
  const expiresAt = new Date(
    Date.parse(now) + SIGN_IN_CODE_LIFETIME_MINUTES * 60_000,
  ).toISOString();

  await transaction
    .insertInto("sign_in_codes")
    .values({
      id: codeId,
      email,
      // The matching member, whatever their status. The redemption path is
      // what refuses a removed one, and it refuses them the same way it
      // refuses a wrong guess.
      member_id: member?.id ?? null,
      code_hash: makeCodeHashFromDigits({ digits, pepper: options.pepper }),
      attempts: 0,
      max_attempts: SIGN_IN_CODE_MAX_ATTEMPTS,
      expires_at: expiresAt,
      consumed_at: null,
      invalidated_at: null,
      created_at: now,
    })
    .execute();

  const isMailable =
    member !== undefined &&
    (member.status === "invited" || member.status === "active");

  if (isMailable) {
    await enqueueEmail({
      executor: transaction,
      input: {
        kind: "sign_in_code",
        toAddress: email,
        toMemberId: member.id,
        toDisplayName: getDisplayNameFromMember({
          storedDisplayName: member.display_name,
          email: member.email,
        }),
        idempotencyKey: `signin:${codeId}`,
        payload: {
          code: digits,
          expiresAt,
          expiresInMinutes: SIGN_IN_CODE_LIFETIME_MINUTES,
        },
        triggerKind: "sign_in_code",
        triggerId: codeId,
      },
      now,
    });
  }

  return { codeId, digits, expiresAt };
}
