import type {
  UploadFilePageRequest,
  ReadUploadFilePageOptions,
  UploadFilePage,
} from "./readUploadFilePage.types.ts";
import { makeUploadFileCursorFromPosition } from "../uploadFileCursorHelpers.ts";

import { makeUploadFileDtosFromRows } from "./makeUploadFileDtosFromRows.ts";

import {
  readFileRows,
  getAfterPosition,
} from "./readUploadFilePageSupportHelpers.ts";

/**
 * One page of a session's files, in manifest order, with their media.
 *
 * Reads one row past the limit to learn whether there is a next page, so the
 * end of the list is a null `nextCursor` and never an empty extra page.
 *
 * @param options.database The Kysely handle, never a transaction: this signs
 *   URLs, so it runs after any transaction has closed.
 * @param options.b2 The Backblaze client, for signing.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.now The request's clock, which `expiresAt` counts from.
 * @param options.page Which page, of which states.
 */
export async function readUploadFilePage(
  options: Readonly<Omit<ReadUploadFilePageOptions, "page">> &
    Readonly<{ page: Readonly<UploadFilePageRequest> }>,
): Promise<UploadFilePage> {
  const rows = await readFileRows({
    database: options.database,
    filter: {
      sessionId: options.sessionId,
      afterPosition: getAfterPosition(options.page.cursor),
      states: options.page.states,
      limit: options.page.limit + 1,
    },
  });
  const pageRows = rows.slice(0, options.page.limit);
  const lastRow = pageRows.at(-1);

  return {
    files: await makeUploadFileDtosFromRows({
      database: options.database,
      b2: options.b2,
      fileRows: pageRows,
      now: options.now,
    }),
    nextCursor:
      rows.length > options.page.limit && lastRow !== undefined
        ? makeUploadFileCursorFromPosition(lastRow.position)
        : undefined,
  };
}
