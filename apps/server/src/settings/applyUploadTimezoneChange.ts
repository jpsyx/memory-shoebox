import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";

/** Keeps each write below SQLite's bound-parameter limit. */
const BATCH_SIZE = 100;

async function _writeChangedUploadDates(
  options: Readonly<{
    transaction: DatabaseExecutor;
    changedFiles: ReadonlyArray<{ fileId: string; captureDate: string }>;
  }>,
): Promise<void> {
  if (options.changedFiles.length === 0) {
    return;
  }
  await options.transaction
    .updateTable("upload_files")
    .set({
      capture_date: sql<string>`case id ${sql.join(
        options.changedFiles.map((file) => {
          return sql`when ${file.fileId} then ${file.captureDate}`;
        }),
        sql` `,
      )} end`,
    })
    .where(
      "id",
      "in",
      options.changedFiles.map((file) => {
        return file.fileId;
      }),
    )
    .execute();
}

async function _applyUploadTimezoneBatches(
  options: Readonly<{
    transaction: DatabaseExecutor;
    timezone: string;
    afterId: string;
  }>,
): Promise<void> {
  const files = await options.transaction
    .selectFrom("upload_files")
    .select(["id", "captured_at", "capture_date"])
    .where("capture_offset_minutes", "is", null)
    .where("captured_at", "is not", null)
    .where("capture_date", "is not", null)
    .where("id", ">", options.afterId)
    .orderBy("id")
    .limit(BATCH_SIZE)
    .execute();
  const changedFiles = files.flatMap((file) => {
    const captureDate = getLocalDayFromInstant({
      instant: file.captured_at!,
      timezone: options.timezone,
    });
    return captureDate === file.capture_date
      ? []
      : [{ fileId: file.id, captureDate }];
  });
  await _writeChangedUploadDates({
    transaction: options.transaction,
    changedFiles,
  });
  const lastFile = files.at(-1);
  if (files.length === BATCH_SIZE && lastFile !== undefined) {
    await _applyUploadTimezoneBatches({ ...options, afterId: lastFile.id });
  }
}

/** Re-derives upload days while preserving capture evidence and transfer state. */
export async function applyUploadTimezoneChange(
  options: Readonly<{
    transaction: DatabaseExecutor;
    timezone: string;
  }>,
): Promise<void> {
  await _applyUploadTimezoneBatches({ ...options, afterId: "" });
}
