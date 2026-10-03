import { z } from "zod";
import { expressionBuilder, type Expression, type SqlBool } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import { calendarDateSchema, idSchema } from "@memory-shoebox/shared";
import { ApiError } from "../http/ApiError.ts";

const milestoneItemCursorSchema = z
  .object({ capturedOn: calendarDateSchema, itemId: idSchema })
  .strict();
/** The total ordering position carried by a milestone item cursor. */
export type MilestoneItemCursor = z.infer<typeof milestoneItemCursorSchema>;

/** Encodes a list position as an opaque URL-safe cursor. */
export function makeMilestoneItemCursorFromPosition(
  position: Readonly<MilestoneItemCursor>,
): string {
  return Buffer.from(
    JSON.stringify({
      capturedOn: position.capturedOn,
      itemId: position.itemId,
    }),
  ).toString("base64url");
}

/** Validates both halves of an opaque cursor before applying its predicate. */
export function getMilestoneItemPositionFromCursor(
  cursor: string | undefined,
): MilestoneItemCursor | undefined {
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
    return milestoneItemCursorSchema.parse(
      JSON.parse(decoded.toString("utf8")),
    );
  } catch {
    throw ApiError.invalidRequest({
      cursor: ["The milestone item cursor is not valid."],
    });
  }
}

/** Selects rows after a position in descending capture-day/item-ID order. */
export function makeMilestoneItemPaginationExpressionFromPosition(
  position: Readonly<MilestoneItemCursor>,
): Expression<SqlBool> {
  const eb = expressionBuilder<Database, "items">();
  return eb.or([
    eb("items.captured_on", "<", position.capturedOn),
    eb.and([
      eb("items.captured_on", "=", position.capturedOn),
      eb("items.id", "<", position.itemId),
    ]),
  ]);
}
