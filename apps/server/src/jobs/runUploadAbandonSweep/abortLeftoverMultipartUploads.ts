import { type Kysely } from "kysely";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { Database } from "../../db/types/db.types.ts";

import { abortMultipartUploads } from "../../upload/abortMultipartUploads/abortMultipartUploads.ts";
import { getMultipartUploadRefFromFile } from "../../upload/abortMultipartUploads/getMultipartUploadRefFromFile.ts";

/**
 * Every failed or cancelled file still holding a multipart upload, from this
 * run or any earlier abort that failed, aborted so Backblaze stops billing
 * the parts. **After the transaction has committed** ,
 * decision 2): a network round trip inside it would hold SQLite's one write
 * lock.
 *
 * Not limited to the sessions this run touched, because a retry is the
 * point: a batch settled last run is not touched again, and its failed abort
 * would otherwise never be retried. `abortMultipartUploads` clears an id only
 * once Backblaze has let go of the upload, and only where the row still holds
 * it, so a failure leaves the row exactly as it was for the next run.
 */
export async function abortLeftoverMultipartUploads(
  options: Readonly<{
    database: Kysely<Database>;
    b2: B2Client;
  }>,
): Promise<number> {
  const rows = await options.database
    .selectFrom("upload_files")
    .select(["id", "storage_key", "multipart_upload_id"])
    .where("state", "in", [...(["failed", "cancelled"] as const)])
    .where("multipart_upload_id", "is not", null)
    .execute();
  const { abortedCount } = await abortMultipartUploads({
    database: options.database,
    b2: options.b2,
    uploads: rows.flatMap((row) => {
      const upload = getMultipartUploadRefFromFile(row);
      return upload === undefined ? [] : [upload];
    }),
  });
  return abortedCount;
}
