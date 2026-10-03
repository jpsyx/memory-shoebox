import { z } from "zod";

/**
 * The cursor of the session detail's embedded file list.
 *
 * It encodes `upload_files.position`, not the uuidv7 id: the manifest's order
 * is the order the surface draws, and `UNIQUE (upload_session_id, position)`
 * is the index the page walks (`upload.md` Ruling 7). Base64url over a short
 * JSON object, the shape `items/burstFrameCursorHelpers.ts` and the
 * timeline's cursor use, so the product has one style of cursor. It is not
 * signed and does not need to be: it encodes nothing the caller does not
 * already hold, and the session it pages was resolved for the viewer first.
 */

/** The wire form, kept short because it travels in a query string. */
const wireStateSchema = z.object({ p: z.number().int().nonnegative() });

/** JSON, or nothing. A cursor somebody typed is not an exception. */
function _parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Malformed input from the wire, not a bug in this process.
    return undefined;
  }
}

/**
 * The cursor for the page after the row at this position.
 *
 * @param position `upload_files.position` of the last row a page returned.
 */
export function makeUploadFileCursorFromPosition(position: number): string {
  return Buffer.from(JSON.stringify({ p: position })).toString("base64url");
}

/**
 * The position a cursor encodes, or nothing for one this route did not issue.
 *
 * `undefined` rather than a throw, so the caller decides that a bad cursor
 * is a `400` and this module stays free of HTTP.
 *
 * @param cursor The opaque string the client sent.
 */
export function getPositionFromUploadFileCursor(
  cursor: string,
): number | undefined {
  const parsed = wireStateSchema.safeParse(
    _parseJson(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  return parsed.success ? parsed.data.p : undefined;
}
