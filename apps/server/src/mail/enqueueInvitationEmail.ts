import type { InvitationEmailPayload } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { MembersTable } from "../db/types/identityAndAccess.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { enqueueEmail } from "./enqueueEmail/enqueueEmail.ts";

type EnqueueInvitationEmailOptions = {
  transaction: DatabaseExecutor;
  invitationId: string;
  inviterMemberId: string;
  invitedMemberId: string;
  sendCount: number;
  expiresAt: string;
  now: string;
};
type InvitationFacts = {
  inviter: MembersTable;
  invitee: MembersTable;
  baseUrl: string | undefined;
  memberCount: number;
  visibleItemCount: number;
};

async function _readMember(
  options: Readonly<{ database: DatabaseExecutor; memberId: string }>,
): Promise<MembersTable> {
  return options.database
    .selectFrom("members")
    .selectAll()
    .where("id", "=", options.memberId)
    .executeTakeFirstOrThrow();
}

async function _readItemCount(
  options: Readonly<{ database: DatabaseExecutor; invitee: MembersTable }>,
): Promise<number> {
  const visibleRuleIds = await getVisibleRuleIdsFromMemberId({
    database: options.database,
    memberId: options.invitee.id,
  });
  const row = await applyVisibilityFilter({
    query: options.database.selectFrom("items").select((eb) => {
      return eb.fn.count<number>("id").as("itemCount");
    }),
    viewer: {
      memberId: options.invitee.id,
      sessionId: "",
      role:
        options.invitee.role === "admin"
          ? "admin"
          : options.invitee.role === "uploader"
            ? "uploader"
            : "viewer",
      isAdmin: options.invitee.role === "admin",
      visibleRuleIds,
    },
  }).executeTakeFirstOrThrow();
  return row.itemCount;
}

async function _readInvitationFacts(
  options: Readonly<EnqueueInvitationEmailOptions>,
): Promise<InvitationFacts> {
  const { transaction } = options;
  const [inviter, invitee, settings, memberCountRow] = await Promise.all([
    _readMember({ database: transaction, memberId: options.inviterMemberId }),
    _readMember({ database: transaction, memberId: options.invitedMemberId }),
    readInstanceSettings({ database: transaction, keys: ["public.base_url"] }),
    transaction
      .selectFrom("members")
      .select((eb) => {
        return eb.fn.count<number>("id").as("memberCount");
      })
      .where("status", "in", ["active", "invited"])
      .executeTakeFirstOrThrow(),
  ]);
  const visibleItemCount = await _readItemCount({
    database: transaction,
    invitee,
  });
  return {
    inviter,
    invitee,
    baseUrl: settings["public.base_url"] ?? undefined,
    memberCount: memberCountRow.memberCount,
    visibleItemCount,
  };
}

function _makeInvitationPayloadFromFacts(
  options: Readonly<{ facts: InvitationFacts; expiresAt: string }>,
): Pick<
  InvitationEmailPayload,
  | "inviterDisplayName"
  | "inviterEmail"
  | "invitedAddress"
  | "joinUrl"
  | "expiresAt"
  | "visibleItemCount"
  | "memberCount"
> {
  const { facts } = options;
  return {
    inviterDisplayName: getDisplayNameFromMember({
      storedDisplayName: facts.inviter.display_name ?? undefined,
      email: facts.inviter.email,
    }),
    inviterEmail: facts.inviter.email,
    invitedAddress: facts.invitee.email,
    joinUrl: `${facts.baseUrl ?? ""}/join?address=${encodeURIComponent(facts.invitee.email)}`,
    expiresAt: options.expiresAt,
    visibleItemCount: facts.visibleItemCount,
    memberCount: facts.memberCount,
  };
}

/**
 * Freezes invitation copy and recipient facts inside the authority transaction.
 */
export async function enqueueInvitationEmail(
  options: Readonly<EnqueueInvitationEmailOptions>,
): Promise<void> {
  const facts = await _readInvitationFacts(options);
  await enqueueEmail({
    executor: options.transaction,
    now: options.now,
    input: {
      kind: "invitation",
      toAddress: facts.invitee.email,
      toMemberId: facts.invitee.id,
      toDisplayName: facts.invitee.display_name ?? undefined,
      triggerKind: "invitation",
      triggerId: options.invitationId,
      idempotencyKey: `invite:${options.invitationId}:${options.sendCount}`,
      payload: _makeInvitationPayloadFromFacts({
        facts,
        expiresAt: options.expiresAt,
      }),
    },
  });
}
