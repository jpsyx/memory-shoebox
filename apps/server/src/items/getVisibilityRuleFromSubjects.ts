import { createHash } from "node:crypto";
import type { ResolveVisibilityRuleRequest } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../visibility/everyoneRule.ts";

/**
 * One subject of a rule, as the request names it.
 *
 * Taken from the request schema rather than restated: the route parses the
 * body with `resolveVisibilityRuleRequestSchema` and hands the fields
 * straight to this module, so a second declaration here would be a second
 * place for the contract to drift from itself.
 */
export type RuleSubjectInput = ResolveVisibilityRuleRequest["subjects"][number];

/**
 * The canonical form of a subject list: deduplicated, then sorted by kind with
 * `group` before `member`, then by id.
 *
 * The sort is what makes the digest stable across two clients that listed the
 * same people in a different order.
 */
function _makeCanonicalSubjects(
  subjects: readonly RuleSubjectInput[],
): RuleSubjectInput[] {
  return [
    ...new Map(
      subjects.map((subject) => {
        return [`${subject.kind}:${subject.id}`, subject];
      }),
    ).values(),
  ].sort((left, right) => {
    return (
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
    );
  });
}

/** The hash `visibility_rules.subject_digest` stores. `''` for everyone. */
function _makeDigestFromSubjects(
  subjects: readonly RuleSubjectInput[],
): string {
  if (subjects.length === 0) {
    return "";
  }
  return createHash("sha256")
    .update(
      subjects
        .map((subject) => {
          return `${subject.kind}:${subject.id}`;
        })
        .join("\n"),
    )
    .digest("hex");
}

/** Refuses a subject that names nobody, or somebody who has been removed. */
async function _assertSubjectsExist(options: {
  transaction: DatabaseExecutor;
  subjects: readonly RuleSubjectInput[];
}): Promise<void> {
  const memberIds = options.subjects.flatMap((subject) => {
    return subject.kind === "member" ? [subject.id] : [];
  });
  const groupIds = options.subjects.flatMap((subject) => {
    return subject.kind === "group" ? [subject.id] : [];
  });

  const [members, groups] = await Promise.all([
    memberIds.length === 0
      ? []
      : options.transaction
          .selectFrom("members")
          .select("members.id as id")
          .where("members.id", "in", memberIds)
          .where("members.status", "!=", "removed")
          .execute(),
    groupIds.length === 0
      ? []
      : options.transaction
          .selectFrom("groups")
          .select("groups.id as id")
          .where("groups.id", "in", groupIds)
          .execute(),
  ]);

  if (
    members.length !== new Set(memberIds).size ||
    groups.length !== new Set(groupIds).size
  ) {
    throw ApiError.invalidRequest({
      subjects: ["One of those people or groups is not in the Shoebox."],
    });
  }
}

/**
 * Finds the rule for a `(mode, subject set)`, or creates it.
 *
 * **It never updates an existing rule and never deletes one.** Rules are
 * shared: one covers 264 files in the fixtures, so editing one in place to
 * change one photograph would change the other 263. They accumulate, and the
 * daily `visibility-rule-sweep` drops the ones no item references.
 *
 * The index on `(mode, subject_digest)` is deliberately **not** unique:
 * deleting a member can make two previously distinct rules collide, and
 * tolerating an equivalent duplicate is cheaper than merging them
 * mid-transaction. Two rows with one digest have the same subject list by
 * construction, so taking the lowest uuidv7 is both correct and deterministic.
 *
 * Not named `resolve...`: the word names neither side, and `AGENTS.md`
 * forbids it outright. This gets a rule id from a subject set.
 *
 * @param options.transaction The caller's transaction.
 * @param options.mode `everyone`, `only` or `except`.
 * @param options.subjects The members and groups named.
 * @param options.now The instant a new rule carries.
 */
export async function getVisibilityRuleFromSubjects(options: {
  transaction: DatabaseExecutor;
  mode: ResolveVisibilityRuleRequest["mode"];
  subjects: readonly RuleSubjectInput[];
  now: string;
}): Promise<string> {
  const subjects = _makeCanonicalSubjects(options.subjects);

  // `everyone` costs nothing: the seeded row exists at migration time
  // precisely so the default needs no lookup. An exception to nobody is the
  // same rule rather than a second way of saying the same thing.
  if (options.mode === "everyone" || subjects.length === 0) {
    if (options.mode === "only") {
      // On this surface it is always an unfinished form, which the control
      // renders as "Nobody yet". The genuine empty-allow-list case arises
      // from a group deletion and belongs to the Groups surface.
      throw ApiError.invalidRequest({
        subjects: ["Choose at least one person or group."],
      });
    }
    return EVERYONE_VISIBILITY_RULE_ID;
  }

  await _assertSubjectsExist({ transaction: options.transaction, subjects });

  const digest = _makeDigestFromSubjects(subjects);
  const existing = await options.transaction
    .selectFrom("visibility_rules")
    .select("visibility_rules.id as ruleId")
    .where("visibility_rules.mode", "=", options.mode)
    .where("visibility_rules.subject_digest", "=", digest)
    .orderBy("visibility_rules.id", "asc")
    .limit(1)
    .executeTakeFirst();

  if (existing !== undefined) {
    return existing.ruleId;
  }

  const ruleId = createId();
  await options.transaction
    .insertInto("visibility_rules")
    .values({
      id: ruleId,
      mode: options.mode,
      subject_digest: digest,
      created_at: options.now,
    })
    .execute();
  await options.transaction
    .insertInto("visibility_rule_subjects")
    .values(
      subjects.map((subject) => {
        return {
          id: createId(),
          rule_id: ruleId,
          subject_type: subject.kind,
          member_id: subject.kind === "member" ? subject.id : null,
          group_id: subject.kind === "group" ? subject.id : null,
        };
      }),
    )
    .execute();

  return ruleId;
}
