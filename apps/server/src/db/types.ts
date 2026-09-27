/** One invited address, for the life of the Shoebox. Never hard-deleted. */
export type MembersTable = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  notify_on_upload: number;
  notify_on_comment: number;
  notify_on_reply: number;
  notify_on_removal: number;
  joined_at: string | null;
  last_signed_in_at: string | null;
  last_seen_at: string | null;
  removed_at: string | null;
  created_at: string;
};

/**
 * One six-digit sign-in code, stored as `HMAC-SHA256(digits, server_pepper)`.
 *
 * A row is written even for an address that is not a member, so that an
 * unknown address is indistinguishable from a known one: `member_id` is null
 * when nothing was mailed.
 */
export type SignInCodesTable = {
  id: string;
  email: string;
  member_id: string | null;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  invalidated_at: string | null;
  created_at: string;
};

/**
 * One signed-in device. Named for its lifetime: the row appears at sign-in,
 * vanishes on sign-out, and falls out at 30 days idle.
 */
export type SessionsTable = {
  id: string;
  member_id: string;
  token_hash: string;
  device_label: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
};

/**
 * One invitation email. It carries no credential: acceptance is the first
 * successful sign-in at the invited address, and `members.status` alone
 * decides whether an address may sign in.
 */
export type InvitationsTable = {
  id: string;
  member_id: string;
  invited_by_member_id: string;
  created_at: string;
  expires_at: string;
  send_count: number;
  last_sent_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};

/** A named set of members, used as a visibility subject. */
export type GroupsTable = {
  id: string;
  name: string;
  name_normalized: string;
  created_at: string;
};

/** One member's membership of one group. */
export type GroupMembersTable = {
  id: string;
  group_id: string;
  member_id: string;
  created_at: string;
};

/**
 * The SQLite schema as Kysely sees it: one property per table, mapping the
 * table name to the shape of a row. Every table added by a migration under
 * `src/db/migrations/` gets a matching entry here, and Kysely then type-checks
 * every query against it.
 */
export type Database = {
  members: MembersTable;
  sign_in_codes: SignInCodesTable;
  sessions: SessionsTable;
  invitations: InvitationsTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
};
