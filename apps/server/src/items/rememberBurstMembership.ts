import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Records original order and group metadata before membership can change. */
export async function rememberBurstMembership(
  options: Readonly<{
    database: DatabaseExecutor;
    itemIds: readonly string[];
  }>,
): Promise<void> {
  if (options.itemIds.length === 0) {
    return;
  }
  const rows = await options.database
    .selectFrom("items")
    .innerJoin("bursts", "bursts.id", "items.burst_id")
    .selectAll("bursts")
    .select(["items.id as item_id", "items.burst_index"])
    .where("items.id", "in", [...options.itemIds])
    .execute();
  const histories = rows.flatMap(({ id, burst_index, ...row }) => {
    return burst_index === null ? [] : [{ ...row, burst_id: id, burst_index }];
  });
  if (histories.length > 0) {
    await options.database
      .insertInto("item_burst_history")
      .values(histories)
      .onConflict((conflict) => {
        return conflict.column("item_id").doNothing();
      })
      .execute();
  }
}
