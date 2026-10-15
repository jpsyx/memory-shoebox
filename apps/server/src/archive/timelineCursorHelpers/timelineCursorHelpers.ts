import { createHash } from "node:crypto";
import { z } from "zod";
import type { TimelineFilter } from "../selectionFilterHelpers.ts";

/** An exclusive boundary within one normalised selection. */
export type TimelinePageState = {
  /** The `captured_on` excluded from the requested directional page. */
  boundaryDay: string;
  /** A digest of the normalised selection this cursor was ranked against. */
  filterDigest: string;
  /** Which side of the boundary to read, nearest days first. */
  direction: "older" | "newer";
};

/** The wire form, kept short because it travels in a query string. */
const legacyWireStateSchema = z.object({
  v: z.undefined().optional(),
  direction: z.undefined().optional(),
  d: z.iso.date(),
  // Supplied opened IDs are validated and ignored; bands depend on all spans.
  o: z.array(z.uuid()).optional(),
  f: z.string(),
}) satisfies z.ZodType;

/** New cursors always declare their direction and version. */
const wireStateSchema = z.union([
  z.object({
    v: z.literal(2),
    d: z.iso.date(),
    f: z.string(),
    direction: z.enum(["older", "newer"]),
  }),
  legacyWireStateSchema,
]);

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
 * Base64url over `{ v: 2, d, f, direction }`. It is not signed: it
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
      v: 2,
      d: state.boundaryDay,
      f: state.filterDigest,
      direction: state.direction,
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
        boundaryDay: parsed.data.d,
        filterDigest: parsed.data.f,
        direction: parsed.data.direction ?? "older",
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
