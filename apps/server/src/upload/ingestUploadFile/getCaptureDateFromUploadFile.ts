import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";
import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

/** Reads the ingest transaction's timezone for offset-less derived days. */
export async function getCaptureDateFromUploadFile(
  options: Readonly<{
    transaction: DatabaseExecutor;
    file: Readonly<UploadFileRow>;
  }>,
): Promise<string | null> {
  const { file } = options;
  if (
    file.capture_offset_minutes !== null ||
    file.captured_at === null ||
    file.capture_date === null
  ) {
    return file.capture_date;
  }
  const settings = await readInstanceSettings({
    database: options.transaction,
    keys: ["shoebox.timezone"],
  });
  return getLocalDayFromInstant({
    instant: file.captured_at,
    timezone: settings["shoebox.timezone"],
  });
}
