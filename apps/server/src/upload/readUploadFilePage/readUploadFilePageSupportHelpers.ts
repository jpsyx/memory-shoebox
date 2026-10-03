import type { UploadFileState } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { getPositionFromUploadFileCursor } from "../uploadFileCursorHelpers.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type { FileRowFilter } from "./readUploadFilePage.types.ts";

/** The files of one session, in manifest order, one page of them. */
export async function readFileRows(
  options: Readonly<{
    database: DatabaseExecutor;
    filter: Readonly<Omit<FileRowFilter, "states">> & {
      states: readonly UploadFileState[] | undefined;
    };
  }>,
): Promise<UploadFileRow[]> {
  const { filter } = options;
  const base = options.database
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", filter.sessionId);
  const afterCursor =
    filter.afterPosition === undefined
      ? base
      : base.where("position", ">", filter.afterPosition);
  const byState =
    filter.states === undefined
      ? afterCursor
      : afterCursor.where("state", "in", [...filter.states]);

  return byState.orderBy("position", "asc").limit(filter.limit).execute();
}

/** The position after which a page starts, or the `400` for a bad cursor. */
export function getAfterPosition(
  cursor: string | undefined,
): number | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  const position = getPositionFromUploadFileCursor(cursor);
  if (position === undefined) {
    throw ApiError.invalidRequest({
      cursor: ["This is not a cursor this route issued."],
    });
  }
  return position;
}
