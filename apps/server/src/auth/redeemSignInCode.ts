import { syncMemberPerson } from "../members/syncMemberPerson.ts";
import type { Kysely } from "kysely";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Database } from "../db/types/db.types.ts";
import { seedItemViews } from "../members/seedItemViews.ts";
import {
  createSessionForMember,
  type CreatedSession,
} from "./createSessionForMember.ts";
import { mintSignInCode } from "./mintSignInCode.ts";
import { makeTokenHashFromToken } from "./sessionToken.ts";
import {
  isMatchingCodeHash,
  makeCodeHashFromDigits,
} from "./signInCodeHelpers.ts";

/**
 * What the transaction decided.
 *
 * **Returned rather than thrown.** The route turns each of these into its
 * `ApiError`, because throwing inside the transaction would roll back the
 * attempt increment and a wrong code would never count down.
 */
export type RedeemSignInCodeOutcome =
  | { kind: "expired" }
  | { kind: "invalid"; attemptsRemaining: number }
  | { kind: "exhausted" }
  | {
      kind: "created";
      memberId: string;
      isFirstSignIn: boolean;
      session: CreatedSession;
    };

/** Everything the redemption needs. */
export type RedeemSignInCodeInput = {
  database: Kysely<Database>;
  /** Normalised. */
  email: string;
  /** Six digits, as typed. */
  code: string;
  pepper: Buffer;
  now: string;
  userAgent: string | undefined;
  /** The cookie this request presented, if any. */
  presentedToken: string | undefined;
};

/** The live code for an address: at most one, because every mint supersedes. */
async function _getLiveCodeFromEmail(options: {
  transaction: Kysely<Database>;
  email: string;
  now: string;
}) {
  return (
    options.transaction
      .selectFrom("sign_in_codes")
      .select(["id", "member_id", "code_hash", "attempts", "max_attempts"])
      .where("email", "=", options.email)
      .where("consumed_at", "is", null)
      .where("invalidated_at", "is", null)
      .where("expires_at", ">", options.now)
      // Not `created_at`: these ids are UUIDv7, so they sort by creation even
      // for two rows minted in the same millisecond, which `created_at` alone
      // cannot tell apart.
      .orderBy("id", "desc")
      .executeTakeFirst()
  );
}

/** The member the code names, when they may still sign in. */
async function _getUsableMemberFromMemberId(options: {
  transaction: Kysely<Database>;
  memberId: string | undefined;
}) {
  if (options.memberId === undefined) {
    return undefined;
  }
  // `status` alone decides whether an address may sign in
  // (`data-models.md` § `invitations`), which is what makes a lapsed
  // invitation, a revoked one and a removal one question rather than three.
  return options.transaction
    .selectFrom("members")
    .select(["id", "joined_at", "status"])
    .where("id", "=", options.memberId)
    .where("status", "in", ["invited", "active"])
    .executeTakeFirst();
}

/** Counts a wrong attempt, and replaces the code when it was the last. */
async function _countWrongAttempt(options: {
  transaction: Kysely<Database>;
  code: { id: string; attempts: number; max_attempts: number };
  email: string;
  pepper: Buffer;
  now: string;
}): Promise<RedeemSignInCodeOutcome> {
  const attempts = options.code.attempts + 1;
  await options.transaction
    .updateTable("sign_in_codes")
    .set({ attempts })
    .where("id", "=", options.code.id)
    .execute();

  if (attempts < options.code.max_attempts) {
    // Read off the row after the increment, never from a constant: the first
    // wrong code of three gives 2, which is the mockup's "Two tries left".
    return {
      kind: "invalid",
      attemptsRemaining: options.code.max_attempts - attempts,
    };
  }

  // "Two tries left before we send you a new one" is a promise, and the
  // alternative reading strands the least technical person in the family at a
  // dead end (`auth.md` Ruling 2).
  await options.transaction
    .updateTable("sign_in_codes")
    .set({ invalidated_at: options.now })
    .where("id", "=", options.code.id)
    .execute();
  await mintSignInCode({
    transaction: options.transaction,
    email: options.email,
    pepper: options.pepper,
    now: options.now,
  });
  return { kind: "exhausted" };
}

/**
 * Records sign-in and activates invited membership, including a return.
 * Archive seeding and joined_at remain exclusive to the first-ever sign-in.
 *
 * @returns Whether this was the first sign-in.
 */
async function _markMemberSignedIn(options: {
  transaction: Kysely<Database>;
  member: { id: string; joined_at: string | null; status: string };
  now: string;
}): Promise<boolean> {
  const { transaction, member, now } = options;

  // Acceptance is the first successful sign-in since this invitation.
  // A returning member keeps their first-ever join timestamp.
  const isFirstSignIn = member.joined_at === null;
  await transaction
    .updateTable("members")
    .set({
      // Unthrottled: it is once per redemption rather than once per request,
      // and it is a different fact from `last_seen_at`.
      last_signed_in_at: now,
      status: "active",
      ...(isFirstSignIn ? { joined_at: now } : {}),
    })
    .where("id", "=", member.id)
    .execute();

  if (member.status === "invited") {
    await transaction
      .updateTable("invitations")
      .set({ accepted_at: now })
      .where("member_id", "=", member.id)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .execute();
  }
  if (isFirstSignIn) {
    await seedItemViews({ transaction, memberId: member.id, now });
  }

  return isFirstSignIn;
}

/** Consumes the code and signs the member in. */
async function _acceptCode(options: {
  transaction: Kysely<Database>;
  codeId: string;
  member: { id: string; joined_at: string | null; status: string };
  now: string;
  userAgent: string | undefined;
  presentedToken: string | undefined;
}): Promise<RedeemSignInCodeOutcome> {
  const { transaction, codeId, member, now, userAgent, presentedToken } =
    options;

  // This write falsifies the liveness predicate `_getLiveCodeFromEmail`
  // checks, which is what makes the code single use.
  await transaction
    .updateTable("sign_in_codes")
    .set({ consumed_at: now })
    .where("id", "=", codeId)
    .execute();

  // The cookie is about to be overwritten, so leaving that row live would
  // strand an unreachable device in somebody's list with no way to recognise
  // it.
  if (presentedToken !== undefined) {
    await transaction
      .deleteFrom("sessions")
      .where("token_hash", "=", makeTokenHashFromToken(presentedToken))
      .execute();
  }

  const session = await createSessionForMember({
    transaction,
    memberId: member.id,
    userAgent,
    now,
  });

  const isFirstSignIn = await _markMemberSignedIn({
    transaction,
    member,
    now,
  });

  await syncMemberPerson({ transaction, memberId: member.id, now });
  return { kind: "created", memberId: member.id, isFirstSignIn, session };
}

/**
 * Redeems a six-digit code into a session, in one `BEGIN IMMEDIATE`
 * transaction (`auth.md` § `POST /api/auth/session`).
 *
 * **A correct guess against an address with no usable member takes the wrong
 * path unchanged**, including the increment and the exhaustion: one chance in
 * a million per attempt must not be distinguishable from a miss, or the form
 * becomes a membership oracle after all.
 *
 * @param input.database The Kysely handle. A fresh `BEGIN IMMEDIATE`
 *   transaction is opened on it and used throughout.
 * @param input.email Normalised.
 * @param input.code Six digits, as typed.
 * @param input.pepper The server's sign-in code pepper.
 * @param input.now The redemption instant.
 * @param input.userAgent The request header, or undefined.
 * @param input.presentedToken The cookie this request presented, if any.
 */
export async function redeemSignInCode(
  input: RedeemSignInCodeInput,
): Promise<RedeemSignInCodeOutcome> {
  return runInImmediateTransaction({
    database: input.database,
    callback: async (transaction) => {
      const code = await _getLiveCodeFromEmail({
        transaction,
        email: input.email,
        now: input.now,
      });
      // None means expired, superseded, consumed or never issued. Nothing else
      // is attempted and nothing is written.
      if (code === undefined) {
        return { kind: "expired" };
      }

      const member = await _getUsableMemberFromMemberId({
        transaction,
        memberId: code.member_id ?? undefined,
      });
      const isMatch = isMatchingCodeHash({
        leftHash: code.code_hash,
        rightHash: makeCodeHashFromDigits({
          digits: input.code,
          pepper: input.pepper,
        }),
      });

      if (!isMatch || member === undefined) {
        return _countWrongAttempt({
          transaction,
          code,
          email: input.email,
          pepper: input.pepper,
          now: input.now,
        });
      }

      return _acceptCode({
        transaction,
        codeId: code.id,
        member,
        now: input.now,
        userAgent: input.userAgent,
        presentedToken: input.presentedToken,
      });
    },
  });
}
