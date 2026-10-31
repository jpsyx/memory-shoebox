import { sql } from "kysely";
import { makeAccountNameKeyFromName } from "@memory-shoebox/shared";
import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW, shiftDays } from "./seedTime.ts";

async function _getProfileFromFixture(options: {
  database: Kysely<Database>;
  overrides: Partial<Database["members"]>;
  id: string;
}) {
  const columns = await sql<{
    name: string;
  }>`pragma table_info(members)`.execute(options.database);
  const hasClaims = columns.rows.some((column) => {
    return column.name === "profile_completed_at";
  });
  const displayName =
    options.overrides.display_name === undefined
      ? hasClaims
        ? `Member ${options.id}`
        : "Abuela Rosa"
      : options.overrides.display_name;
  const completedAt =
    options.overrides.profile_completed_at === undefined
      ? displayName
        ? NOW
        : null
      : options.overrides.profile_completed_at;
  return { hasClaims, displayName, completedAt };
}

/**
 * Inserts one member and returns its id.
 *
 * Current catalogs default to a unique claimed, completed active uploader.
 * Pre-0019 migration fixtures retain their historical name and schema shape.
 */
export async function insertMember(
  database: Kysely<Database>,
  overrides: Partial<Database["members"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  const { hasClaims, displayName, completedAt } = await _getProfileFromFixture({
    database,
    overrides,
    id,
  });
  await database
    .insertInto("members")
    .values({
      id,
      email: `${id}@example.com`,
      display_name: displayName,
      ...(hasClaims ? { profile_completed_at: completedAt } : {}),
      role: "uploader",
      status: "active",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: NOW,
      last_signed_in_at: NOW,
      last_seen_at: NOW,
      removed_at: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  if (hasClaims && completedAt && displayName) {
    await database
      .insertInto("member_name_claims")
      .values({
        name_key: makeAccountNameKeyFromName(displayName),
        member_id: id,
        display_name: displayName,
        created_at: NOW,
      })
      .execute();
  }
  return id;
}

/** Inserts one session for a member and returns its id. */
export async function insertSession(
  database: Kysely<Database>,
  options: { memberId: string } & Partial<Database["sessions"]>,
): Promise<string> {
  const { memberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("sessions")
    .values({
      id,
      member_id: memberId,
      token_hash: `hash-${id}`,
      device_label: "A phone",
      user_agent: null,
      created_at: NOW,
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one invitation and returns its id. */
export async function insertInvitation(
  database: Kysely<Database>,
  options: {
    memberId: string;
    invitedByMemberId: string;
  } & Partial<Database["invitations"]>,
): Promise<string> {
  const { memberId, invitedByMemberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("invitations")
    .values({
      id,
      member_id: memberId,
      invited_by_member_id: invitedByMemberId,
      created_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 7 }),
      send_count: 1,
      last_sent_at: NOW,
      revoked_at: null,
      accepted_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Insert an identity that still needs to choose its account name. */
export async function insertIncompleteMember(
  database: Kysely<Database>,
  overrides: Partial<Database["members"]> = {},
): Promise<string> {
  return insertMember(database, {
    ...overrides,
    display_name: null,
    profile_completed_at: null,
  });
}
