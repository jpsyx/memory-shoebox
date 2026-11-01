import { sql, type Kysely } from "kysely";
import { createHash } from "node:crypto";
import { uuidv7 } from "uuidv7";
import type { Database } from "../types/db.types.ts";

/** Frozen legacy identity input, independent of future account-name changes. */
type LegacyMember = Readonly<{
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  joined_at: string | null;
  last_signed_in_at: string | null;
  created_at: string;
}>;
/** An offline audit row. Email fallback is confined to this rollout report. */
export type MemberNameRolloutRow = Readonly<{
  memberId: string;
  currentName: string;
  proposedName: string;
  issue: "collision" | "invalid" | null;
}>;
/** Snapshot token and bounded member audit consumed by the offline operator. */
export type MemberNameRollout = Readonly<{
  rows: readonly MemberNameRolloutRow[];
  catalogFingerprint: string;
}>;
/** Explicit operator choices tied to the audited catalog snapshot. */
export type MemberNameAssignments = Readonly<{
  catalogFingerprint: string;
  assignments: ReadonlyArray<
    Readonly<{ memberId: string; displayName: string }>
  >;
}>;

/** Frozen validation and display normalization for migration 0019. */
export function makeLegacyDisplayNameFromName(name: string): string | null {
  if (/[@\r\n\v\f\u0085\u2028\u2029\p{Cf}]/u.test(name)) {
    return null;
  }
  const displayName = name.normalize("NFC").trim().replace(/\s+/gu, " ");
  return displayName.length > 0 && displayName.length <= 80
    ? displayName
    : null;
}

function _getCurrentNameFromMember(member: LegacyMember): string {
  return (
    member.display_name?.trim() || member.email.split("@")[0] || member.email
  );
}

async function _getMembers(
  database: Kysely<Database>,
): Promise<LegacyMember[]> {
  return database
    .selectFrom("members")
    .select([
      "id",
      "email",
      "display_name",
      "status",
      "joined_at",
      "last_signed_in_at",
      "created_at",
    ])
    .orderBy("id")
    .execute();
}

async function _getSnapshot(database: Kysely<Database>) {
  const members = await _getMembers(database);
  const people = await database
    .selectFrom("people")
    .select(["id", "member_id", "display_name"])
    .where("member_id", "is not", null)
    .orderBy("id")
    .execute();
  const history = (
    await sql`select * from kysely_migration order by name`.execute(database)
  ).rows;
  const checksums = (
    await sql`select * from kysely_migration_checksums order by name`.execute(
      database,
    )
  ).rows;
  return { members, people, history, checksums };
}

function _getRolloutRows(
  members: readonly LegacyMember[],
): MemberNameRolloutRow[] {
  const names = members.map((member) => {
    return makeLegacyDisplayNameFromName(_getCurrentNameFromMember(member));
  });
  const counts = new Map<string, number>();
  names.forEach((name) => {
    if (name) {
      counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
    }
  });
  return members.map((member, index) => {
    const name = names[index] ?? null;
    const issue =
      name === null
        ? "invalid"
        : (counts.get(name.toLowerCase()) ?? 0) > 1
          ? "collision"
          : null;
    return {
      memberId: member.id,
      currentName: _getCurrentNameFromMember(member),
      proposedName: name ?? "",
      issue,
    };
  });
}

/**
 * Frozen fingerprint: member identity, linked names, and applied migration
 * history only.
 */
export async function getLegacyRolloutFromDatabase(
  database: Kysely<Database>,
): Promise<MemberNameRollout> {
  const snapshot = await _getSnapshot(database);
  return {
    catalogFingerprint: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    rows: _getRolloutRows(snapshot.members),
  };
}

function _getChoices(
  rollout: MemberNameRollout,
  entries: readonly unknown[],
): Map<string, string> {
  const choices = new Map<string, string>();
  entries.forEach((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("memberId" in entry) ||
      typeof entry.memberId !== "string" ||
      !("displayName" in entry) ||
      typeof entry.displayName !== "string"
    ) {
      throw new Error("Invalid assignment row.");
    }
    const row = rollout.rows.find((member) => {
      return member.memberId === entry.memberId;
    });
    const name = makeLegacyDisplayNameFromName(entry.displayName);
    if (!row || choices.has(entry.memberId) || !name) {
      throw new Error(
        "Unknown member, duplicate mapping, or invalid final name.",
      );
    }
    if (row.issue === null && name !== row.proposedName) {
      throw new Error("Unique legacy names must be preserved.");
    }
    choices.set(entry.memberId, name);
  });
  return choices;
}

/** Validate a complete explicit mapping without changing any member. */
export function getFinalNamesFromRollout(
  rollout: MemberNameRollout,
  input: unknown,
): Map<string, string> {
  if (
    !input ||
    typeof input !== "object" ||
    !("catalogFingerprint" in input) ||
    input.catalogFingerprint !== rollout.catalogFingerprint ||
    !("assignments" in input) ||
    !Array.isArray(input.assignments)
  ) {
    throw new Error("Stale or invalid assignments: run audit again.");
  }
  const choices = _getChoices(rollout, input.assignments);
  const keys = new Set<string>();
  return new Map(
    rollout.rows.map((row) => {
      if (row.issue !== null && !choices.has(row.memberId)) {
        throw new Error(
          "Unresolved collision or invalid name requires an explicit assignment.",
        );
      }
      const name = choices.get(row.memberId) ?? row.proposedName;
      const key = name.toLowerCase();
      if (keys.has(key)) {
        throw new Error("Unresolved name collision in assignments.");
      }
      keys.add(key);
      return [row.memberId, name];
    }),
  );
}

async function _getFinalNames(
  database: Kysely<Database>,
): Promise<Map<string, string>> {
  const rollout = await getLegacyRolloutFromDatabase(database);
  const tables =
    await sql`select name from sqlite_master where type='table' and name='member_name_rollout_assignments'`.execute(
      database,
    );
  if (tables.rows.length === 0) {
    return getFinalNamesFromRollout(rollout, {
      catalogFingerprint: rollout.catalogFingerprint,
      assignments: [],
    });
  }
  const staged = await sql<{
    payload: string;
  }>`select payload from member_name_rollout_assignments`.execute(database);
  if (staged.rows.length !== 1) {
    throw new Error("Invalid staged assignments.");
  }
  return getFinalNamesFromRollout(rollout, JSON.parse(staged.rows[0]!.payload));
}

async function _importMember(
  database: Kysely<Database>,
  member: LegacyMember,
  displayName: string,
): Promise<void> {
  const completedAt =
    member.status === "active" ||
    member.joined_at !== null ||
    member.last_signed_in_at !== null
      ? (member.joined_at ?? member.last_signed_in_at ?? member.created_at)
      : null;
  await database
    .insertInto("member_name_claims")
    .values({
      name_key: displayName.toLowerCase(),
      member_id: member.id,
      display_name: displayName,
      created_at: member.created_at,
    })
    .execute();
  await database
    .updateTable("members")
    .set({
      display_name: displayName,
      profile_completed_at: completedAt,
      suggested_display_name: completedAt === null ? displayName : null,
    })
    .where("id", "=", member.id)
    .execute();
  await _syncLegacyPerson(database, member, displayName);
}

async function _syncLegacyPerson(
  database: Kysely<Database>,
  member: LegacyMember,
  displayName: string,
): Promise<void> {
  const updated = await database
    .updateTable("people")
    .set({ display_name: displayName })
    .where("member_id", "=", member.id)
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows) === 0 && member.status === "active") {
    await database
      .insertInto("people")
      .values({
        id: uuidv7(),
        display_name: displayName,
        member_id: member.id,
        preferred_face_item_id: null,
        created_by: member.id,
        created_at: member.created_at,
      })
      .execute();
  }
}

/**
 * Atomically import legacy names and consume durable offline staging. Runner
 * owns transaction.
 */
export async function up(database: Kysely<Database>): Promise<void> {
  const finalNames = await _getFinalNames(database);
  const members = await _getMembers(database);
  await database.schema
    .alterTable("members")
    .addColumn("profile_completed_at", "text")
    .execute();
  await database.schema
    .alterTable("members")
    .addColumn("suggested_display_name", "text")
    .execute();
  await database.schema
    .createTable("member_name_claims")
    .addColumn("name_key", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("display_name", "text", (column) => {
      return column.notNull();
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();
  await database.schema
    .createIndex("member_name_claims_member")
    .on("member_name_claims")
    .column("member_id")
    .execute();
  await members.reduce(async (previous, member) => {
    await previous;
    await _importMember(database, member, finalNames.get(member.id)!);
  }, Promise.resolve());
  await sql`drop table if exists member_name_rollout_assignments`.execute(
    database,
  );
}
