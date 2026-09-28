import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW, shiftDays } from "./seedTime.ts";

/**
 * Inserts one member and returns its id.
 *
 * Defaults to an active uploader who wants every notification, because that is
 * the row most tests need and the interesting cases are the departures from it.
 */
export async function insertMember(
  database: Kysely<Database>,
  overrides: Partial<Database["members"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await database
    .insertInto("members")
    .values({
      id,
      email: `${id}@example.com`,
      display_name: "Abuela Rosa",
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
