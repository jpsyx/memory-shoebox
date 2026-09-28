import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW } from "./seedHelpers.ts";

/** Inserts one visibility rule and returns its id. */
export async function insertVisibilityRule(
  database: Kysely<Database>,
  options: { mode: "everyone" | "only" | "except" } & Partial<
    Database["visibility_rules"]
  >,
): Promise<string> {
  const { mode, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("visibility_rules")
    .values({
      id,
      mode,
      // Any distinct string: the digest's index is deliberately not unique,
      // and nothing in this slice reads it.
      subject_digest: `digest-${id}`,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Names one member or one group as a rule's subject. */
export async function insertVisibilityRuleSubject(
  database: Kysely<Database>,
  options: { ruleId: string; memberId?: string; groupId?: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("visibility_rule_subjects")
    .values({
      id,
      rule_id: options.ruleId,
      subject_type: options.memberId === undefined ? "group" : "member",
      member_id: options.memberId ?? null,
      group_id: options.groupId ?? null,
    })
    .execute();
  return id;
}

/** Inserts one group and returns its id. */
export async function insertGroup(
  database: Kysely<Database>,
  options: { name: string } & Partial<Database["groups"]> = { name: "Cousins" },
): Promise<string> {
  const { name, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("groups")
    .values({
      id,
      name,
      name_normalized: name.trim().toLowerCase(),
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Puts one member in one group. */
export async function insertGroupMember(
  database: Kysely<Database>,
  options: { groupId: string; memberId: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("group_members")
    .values({
      id,
      group_id: options.groupId,
      member_id: options.memberId,
      created_at: NOW,
    })
    .execute();
  return id;
}
