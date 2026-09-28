import type { Kysely, Transaction } from "kysely";
import { getSettingValueFromStoredValue } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";

/** Either a handle or a transaction: the bump commits with the write. */
export type VisibilityGenerationExecutor =
  | Kysely<Database>
  | Transaction<Database>;

/**
 * Moves `visibility.generation` on, invalidating every viewer's cached
 * `visibleRuleIds` at once (`conventions.md` § The auth middleware).
 *
 * **Call it inside the transaction that made the change**, so the bump commits
 * with the write that earned it or not at all. A committed group edit whose
 * bump rolled back leaves every cached viewer seeing the old answer until
 * something else happens to bump.
 *
 * **Every write that can change what an expansion returns has to call this**,
 * and the list is longer than the sentence in `conventions.md`:
 *
 * | Write                                       | Step |
 * | ------------------------------------------- | ---- |
 * | `group_members` insert or delete            | 8a   |
 * | `visibility_rule_subjects` insert or delete | 6a   |
 * | `members.role` change                       | 8a   |
 * | **`visibility_rules` insert**               | 6a   |
 *
 * The last is the easy one to miss and the only silent one: a new rule naming
 * a viewer is not in that viewer's cached set, so a brand-new upload would be
 * invisible to them until some unrelated edit bumped.
 *
 * A display name change does **not** bump. Invalidating every viewer's cache
 * because somebody fixed their own spelling is a real cost for nothing
 * (`auth.md`, `PATCH /api/me`).
 *
 * @param options.executor The caller's transaction, or a plain handle.
 * @param options.now Overridable so a test can hold time still.
 * @returns The generation now in force.
 */
export async function bumpVisibilityGeneration(options: {
  executor: VisibilityGenerationExecutor;
  now?: string;
}): Promise<number> {
  const { executor } = options;
  const now = options.now ?? new Date().toISOString();

  const row = await executor
    .selectFrom("settings")
    .select("value")
    .where("scope", "=", "instance")
    .where("key", "=", "visibility.generation")
    .executeTakeFirst();

  // A fresh Shoebox holds zero settings rows, and the registry's default is
  // what makes that legible rather than a special case here.
  const current = getSettingValueFromStoredValue(
    "visibility.generation",
    row?.value,
  );
  const next = current + 1;
  const value = JSON.stringify(next);

  const updated = await executor
    .updateTable("settings")
    .set({ value, updated_at: now })
    .where("scope", "=", "instance")
    .where("key", "=", "visibility.generation")
    .executeTakeFirst();

  // An update then an insert rather than an upsert: the unique index is
  // partial (`key WHERE scope = 'instance'`), so an `ON CONFLICT` target here
  // would have to repeat that predicate to match it, and this pair says the
  // same thing without depending on the dialect spelling it the same way.
  if (Number(updated.numUpdatedRows) === 0) {
    await executor
      .insertInto("settings")
      .values({
        id: createId(),
        scope: "instance",
        scope_id: null,
        key: "visibility.generation",
        value,
        updated_at: now,
        updated_by_member_id: null,
      })
      .execute();
  }

  return next;
}
