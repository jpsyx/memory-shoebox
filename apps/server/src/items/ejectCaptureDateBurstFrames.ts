import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Capture destinations whose burst membership may change. */
export type CaptureDateBurstFrame = {
  itemId: string;
  burstId: string | null;
  capturedOn: string;
};

async function _readDepartingFrames(
  database: DatabaseExecutor,
  frames: readonly CaptureDateBurstFrame[],
): Promise<CaptureDateBurstFrame[]> {
  const burstIds = [
    ...new Set(
      frames.flatMap((frame) => {
        return frame.burstId === null ? [] : [frame.burstId];
      }),
    ),
  ];
  if (burstIds.length === 0) {
    return [];
  }
  const bursts = await database
    .selectFrom("bursts")
    .select(["id", "captured_on"])
    .where("id", "in", burstIds)
    .execute();
  const days = new Map(
    bursts.map((burst) => {
      return [burst.id, burst.captured_on];
    }),
  );
  return frames.filter((frame) => {
    return (
      frame.burstId !== null &&
      days.has(frame.burstId) &&
      days.get(frame.burstId) !== frame.capturedOn
    );
  });
}

async function _deleteEmptyBursts(
  database: DatabaseExecutor,
  frames: readonly CaptureDateBurstFrame[],
): Promise<void> {
  const burstIds = frames.flatMap((frame) => {
    return frame.burstId === null ? [] : [frame.burstId];
  });
  await database
    .deleteFrom("bursts")
    .where("id", "in", burstIds)
    .where((eb) => {
      return eb.not(
        eb.exists(
          eb
            .selectFrom("items")
            .select("items.id")
            .whereRef("items.burst_id", "=", "bursts.id"),
        ),
      );
    })
    .execute();
}

/** Ejects frames and deletes genuinely empty bursts using all remaining siblings. */
export async function ejectCaptureDateBurstFrames(
  options: Readonly<{
    database: DatabaseExecutor;
    frames: readonly CaptureDateBurstFrame[];
  }>,
): Promise<Set<string>> {
  const departing = await _readDepartingFrames(
    options.database,
    options.frames,
  );
  const itemIds = departing.map((frame) => {
    return frame.itemId;
  });
  if (itemIds.length > 0) {
    await options.database
      .updateTable("items")
      .set({ burst_id: null, burst_index: null })
      .where("id", "in", itemIds)
      .execute();
    await _deleteEmptyBursts(options.database, departing);
  }
  return new Set(itemIds);
}
