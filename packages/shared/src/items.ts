import { z } from "zod";
import { idSchema } from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/**
 * The item slice's request and response schemas: `tech-specs/apis/timeline.md`.
 *
 * This module is thin on purpose. `POST /api/items/seen` is the one item
 * route the archive read path defines, because the one-way "seen" latch
 * shares nothing with the day stream's selection; the rest of the item
 * slice (`GET /api/items/:itemId`, burst siblings, comments, reactions) is a
 * later step's work and belongs here when it arrives.
 */

/**
 * What the viewer has had on screen.
 *
 * The route answers `204` and reports nothing about these ids. An id that does
 * not exist and an id the viewer's predicate excludes are both silently
 * ignored: per-id feedback of any kind, even a count of rows written, would
 * turn a batch endpoint into a visibility oracle.
 */
export const itemsSeenRequestSchema = z.object({
  /** Items the viewer has actually had on screen. */
  itemIds: z.array(idSchema).max(LIMITS.seenMaxIds),
  /**
   * Bursts drawn as a collapsed stack, expanded to their visible frames on
   * the server, so a stack standing for forty-five frames latches all of them
   * without the client ever holding forty-five ids.
   */
  burstIds: z.array(idSchema).max(LIMITS.seenMaxIds).default([]),
});

/** What the viewer has had on screen. */
export type ItemsSeenRequest = z.infer<typeof itemsSeenRequestSchema>;
