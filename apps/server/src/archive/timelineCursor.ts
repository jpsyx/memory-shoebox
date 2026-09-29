import { createHash } from "node:crypto";
import { z } from "zod";
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { TimelineFilter } from "./selectionFilter.ts";

/**
 * Where the last page stopped, and what it had already said.
 *
 * The band rule is feed-ordered: of the milestones covering a day, the band is
 * the one with the narrowest span that has not already taken a band **further
 * up this feed**. That makes the page's ranking depend on the pages before it,
 * so the state travels in the cursor rather than being recomputed from
 * scratch, which no later page could do.
 */
export type TimelinePageState = {
  /** The `captured_on` of the last day returned. The next page is before it. */
  lastDay: string;
  /** Milestones that have **taken a band**, never merely appeared. */
  openedMilestoneIds: string[];
  /** A digest of the normalised selection this cursor was ranked against. */
  filterDigest: string;
};

/** The wire form, kept short because it travels in a query string. */
const wireStateSchema = z.object({
  d: z.iso.date(),
  o: z.array(z.uuid()),
  f: z.string(),
});

/** How much of the SHA-256 travels. Collisions here cost a `400`, not access. */
const DIGEST_LENGTH = 16;

/**
 * A stable digest of one selection.
 *
 * It exists so a client that changes the filter without resetting the cursor
 * gets a `400` instead of a page ranked against a different feed. `limit` is
 * deliberately not part of it: changing the page size mid-scroll is not a
 * different feed.
 *
 * @param filter The normalised selection.
 */
export function makeDigestFromFilter(filter: Readonly<TimelineFilter>): string {
  const normalised = JSON.stringify([
    filter.tagIds,
    filter.personIds,
    filter.from ?? "",
    filter.until ?? "",
    filter.attachedToMilestoneId ?? "",
    filter.excludeAttached,
  ]);
  return createHash("sha256")
    .update(normalised)
    .digest("base64url")
    .slice(0, DIGEST_LENGTH);
}

/**
 * Encodes a page state as the opaque cursor the client hands back.
 *
 * Base64url over `{ d, o, f }`. It is not signed, and does not need to be: it
 * encodes nothing the caller does not already know and grants nothing, because
 * every query it feeds still carries the viewer's own predicate.
 *
 * @param state Where this page stopped.
 */
export function makeTimelineCursorFromPageState(
  state: Readonly<TimelinePageState>,
): string {
  return Buffer.from(
    JSON.stringify({
      d: state.lastDay,
      o: state.openedMilestoneIds,
      f: state.filterDigest,
    }),
  ).toString("base64url");
}

/**
 * Reads a cursor, or returns nothing at all.
 *
 * `undefined` rather than a throw, so the route decides what a bad cursor
 * means: it is a `400 invalid_request` naming the parameter, and this module
 * stays free of HTTP.
 *
 * @param cursor The opaque string the client sent.
 */
export function getPageStateFromTimelineCursor(
  cursor: string,
): TimelinePageState | undefined {
  const parsed = wireStateSchema.safeParse(
    _parseJson(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  return parsed.success
    ? {
        lastDay: parsed.data.d,
        openedMilestoneIds: parsed.data.o,
        filterDigest: parsed.data.f,
      }
    : undefined;
}

/** JSON, or nothing. A cursor somebody typed is not an exception. */
function _parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Malformed input from the wire, not a bug in this process: swallow it
    // and let the caller treat the cursor as absent rather than crash.
    return undefined;
  }
}

/** Facts about one page, enough to carry its opened set forward. */
type TimelinePageFacts = {
  /** What the incoming cursor carried. */
  previousOpenedIds: readonly string[];
  /** What took a band on this page. */
  bandedIds: readonly string[];
  /** The occasions this page knows about. */
  milestones: readonly MilestoneRef[];
  /** The `captured_on` of the last day returned. */
  lastDay: string;
};

/**
 * The opened set the next cursor carries.
 *
 * Everything that has taken a band, pruned to milestones whose `starts_on` is
 * strictly before the last day returned: no other milestone can cover a later
 * page, so pruning keeps the set at zero to two entries however long the
 * scroll. An id this page cannot resolve is kept rather than dropped, because
 * it took a band on some earlier page and a page further down may still meet
 * it.
 *
 * @param options The page's contribution to the opened set.
 */
export function makeOpenedIdsFromPage(
  options: Readonly<TimelinePageFacts>,
): string[] {
  const startsOnById = new Map(
    options.milestones.map((milestone) => {
      return [milestone.milestoneId, milestone.startsOn];
    }),
  );
  return [
    ...new Set([...options.previousOpenedIds, ...options.bandedIds]),
  ].filter((milestoneId) => {
    const startsOn = startsOnById.get(milestoneId);
    // Kept when unresolved: it took a band on an earlier page, and a page
    // further down this scroll may still meet it.
    return startsOn === undefined || startsOn < options.lastDay;
  });
}
