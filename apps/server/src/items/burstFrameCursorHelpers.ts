import { z } from "zod";

/**
 * Where a page of one fanned burst stopped.
 *
 * The sort key is `(burst_index, id)` rather than the bare `id` every other
 * cursor in the contract encodes, because `burst_index` is the order the strip
 * is read in and does not have to agree with arrival order
 * (`tech-specs/apis/items.md` § `GET /api/bursts/:burstId/frames`).
 *
 * `drawnFrameCount` travels with it because `BurstFrameRef.position` is dense
 * over the frames actually drawn, and a page can drop a frame whose renditions
 * have gone missing. Recomputing the offset server-side would have to count
 * rows, dropped ones included, and the gap that opens is exactly what dense
 * numbering exists to hide. A position that restarted at 1 on page two would
 * be worse still: it tells the viewer there are two frame 1s in one burst.
 */
export type BurstFramePageState = {
  /** `items.burst_index` of the last row the page consumed. Nulls sort last. */
  lastBurstIndex: number | null;
  /** `items.id` of that row, which breaks a tie on `burst_index`. */
  lastItemId: string;
  /** How many frames the client has been handed across every page so far. */
  drawnFrameCount: number;
};

/** The wire form, kept short because it travels in a query string. */
const wireStateSchema = z.object({
  b: z.number().int().nullable(),
  i: z.uuid(),
  n: z.number().int().nonnegative(),
});

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

/**
 * Encodes a page state as the opaque cursor the client hands back.
 *
 * Base64url over `{ b, i, n }`, the same shape
 * `archive/timelineCursorHelpers.ts` uses, so the product has one style of
 * cursor rather than two. It is not signed and does not need to be: it encodes
 * nothing the caller does not already hold, and the query it feeds still
 * carries the viewer's own predicate.
 *
 * @param state Where this page stopped.
 */
export function makeBurstFrameCursorFromPageState(
  state: Readonly<BurstFramePageState>,
): string {
  return Buffer.from(
    JSON.stringify({
      b: state.lastBurstIndex,
      i: state.lastItemId,
      n: state.drawnFrameCount,
    }),
  ).toString("base64url");
}

/**
 * Reads a cursor, or returns nothing at all.
 *
 * `undefined` rather than a throw, so the route decides what a bad cursor
 * means: it is a `400 invalid_request` naming the parameter, exactly as the
 * timeline's is, and this module stays free of HTTP.
 *
 * @param cursor The opaque string the client sent.
 */
export function getPageStateFromBurstFrameCursor(
  cursor: string,
): BurstFramePageState | undefined {
  const parsed = wireStateSchema.safeParse(
    _parseJson(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  return parsed.success
    ? {
        lastBurstIndex: parsed.data.b,
        lastItemId: parsed.data.i,
        drawnFrameCount: parsed.data.n,
      }
    : undefined;
}
