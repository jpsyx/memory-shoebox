import {
  itemSummarySchema,
  LIMITS,
  type ItemsSeenRequest,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";

/** One thing the viewer has had on screen. */
export type Sighting = {
  readonly kind: "item" | "burst";
  readonly id: string;
  /**
   * Whether this print, or any visible frame of this stack, is still unseen.
   */
  readonly hasUnseen: boolean;
};

/**
 * What to post for a batch of sightings, or nothing.
 *
 * **Steady-state browsing must cost zero writes, including zero requests**
 * (`timeline.md` § Performance). The client knows, without asking, whether a
 * batch would do anything: `ItemSummary.isUnseen` answers it for a print and
 * `BurstSummary.hasUnseenFrames` answers it for a collapsed stack, which is the
 * one place the client holds no per-frame flag. So this returns `undefined`
 * when nothing in the batch is unseen, and a familiar archive generates no
 * traffic on this route at all, which matters because SQLite has one writer
 * and that writer is also taking uploads.
 *
 * The whole batch goes when any one of it is unseen rather than only the
 * unseen part: the statement is `INSERT ... ON CONFLICT DO NOTHING`, so the
 * seen ids cost a no-op inside a write that was happening anyway, and
 * splitting them would be two lists for one statement.
 */
export function getSeenRequestFromSightings(
  sightings: readonly Sighting[],
): ItemsSeenRequest | undefined {
  if (
    !sightings.some((sighting) => {
      return sighting.hasUnseen;
    })
  ) {
    return undefined;
  }
  const itemIds = [
    ...new Set(
      sightings
        .filter((sighting) => {
          return sighting.kind === "item";
        })
        .map((sighting) => {
          return sighting.id;
        }),
    ),
  ].slice(0, LIMITS.seenMaxIds);
  const burstIds = [
    ...new Set(
      sightings
        .filter((sighting) => {
          return sighting.kind === "burst";
        })
        .map((sighting) => {
          return sighting.id;
        }),
    ),
  ].slice(0, LIMITS.seenMaxIds);
  return { itemIds, burstIds };
}

/**
 * Latches a batch: the one-way edit that clears the accent dots.
 *
 * Answers `204` and reports nothing about the ids. An id that does not exist
 * and an id the viewer's predicate excludes are both silently ignored, because
 * per-id feedback of any kind would turn a batch endpoint into a visibility
 * oracle.
 */
export function markItemsSeen(body: ItemsSeenRequest): Promise<void> {
  return apiFetch({
    path: "/items/seen",
    schema: z.void(),
    init: jsonInit({ method: "POST", body }),
  });
}

/** The shape one fanned frame comes back as. Re-exported for the fan. */
export const frameSchema = itemSummarySchema;
