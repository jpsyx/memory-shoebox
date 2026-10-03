import { z } from "zod";
import { calendarDateSchema, idSchema } from "@memory-shoebox/shared";
import { ApiError } from "../http/ApiError.ts";

const milestoneCursorSchema = z
  .object({ startsOn: calendarDateSchema, milestoneId: idSchema })
  .strict();
/** The total ordering position carried by a milestone list cursor. */
export type MilestoneCursor = z.infer<typeof milestoneCursorSchema>;

/** Encodes a list position as an opaque URL-safe cursor. */
export function makeMilestoneCursorFromPosition(
  position: MilestoneCursor,
): string {
  return Buffer.from(JSON.stringify(position)).toString("base64url");
}

/** Validates both halves of an opaque cursor before applying its predicate. */
export function getMilestonePositionFromCursor(
  cursor: string | undefined,
): MilestoneCursor | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error("Invalid encoding");
    }
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) {
      throw new Error("Noncanonical encoding");
    }
    return milestoneCursorSchema.parse(JSON.parse(decoded.toString("utf8")));
  } catch {
    throw ApiError.invalidRequest({
      cursor: ["The milestone cursor is not valid."],
    });
  }
}
