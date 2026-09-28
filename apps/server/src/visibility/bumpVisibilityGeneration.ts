import { getSettingValueFromStoredValue } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

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
 * | Write                                         | Caller                          |
 * | ---------------------------------------------- | -------------------------------- |
 * | `group_members` insert or delete              | the group membership editor      |
 * | `visibility_rule_subjects` insert or delete    | the visibility rule subject writer |
 * | `members.role` change                          | the member role change           |
 * | **`visibility_rules` insert**                  | the insert of a new visibility rule |
 *
 * The last is the easy one to miss and the only silent one: a new rule naming
 * a viewer is not in that viewer's cached set, so a brand-new upload would be
 * invisible to them until some unrelated edit bumped.
 *
 * A display name change does **not** bump. Invalidating every viewer's cache
 * because somebody fixed their own spelling is a real cost for nothing
 * (`auth.md`, `PATCH /api/me`).
 *
 * **It reads the generation and then writes it, so it is only race-safe when
 * the caller's transaction holds SQLite's write lock for both halves.** The
 * type accepts a plain handle, which no lock covers, so pass a transaction
 * from `runInImmediateTransaction.ts`: its `BEGIN IMMEDIATE` takes the write
 * lock up front, where Kysely's own deferred `BEGIN` takes it at the first
 * write, which is after this read. Two concurrent bumps without that lock fail
 * in two ways:
 *
 * 1. **A lost increment.** Both read 7 and both write 8. Harmless: only the
 *    fact that the number changed invalidates a cache, never its value.
 * 2. **A duplicate insert**, on a fresh instance where no row exists yet.
 *    Both find nothing to update and both insert, the second violating the
 *    partial unique index on `key WHERE scope = 'instance'`. That throws and
 *    rolls the caller's transaction back, so it is loud rather than silent.
 *
 * @param options.executor The caller's transaction, from
 *   `runInImmediateTransaction.ts`. A plain handle type-checks and is right
 *   for a test or a one-off script, where nothing else is writing.
 * @param options.now Overridable so a test can hold time still.
 * @returns The generation now in force.
 */
export async function bumpVisibilityGeneration(options: {
  executor: DatabaseExecutor;
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
  const storedGeneration = getSettingValueFromStoredValue(
    "visibility.generation",
    row?.value,
  );
  const bumpedGeneration = storedGeneration + 1;
  const value = JSON.stringify(bumpedGeneration);

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

  return bumpedGeneration;
}
