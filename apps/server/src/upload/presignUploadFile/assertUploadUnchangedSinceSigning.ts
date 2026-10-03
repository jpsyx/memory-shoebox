import { ApiError } from "../../http/ApiError.ts";

import { type UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import { PRESIGNABLE_FILE_STATES } from "./uploadStorageKeyHelpers.ts";

/** The row is still the one that was signed for, or a 409 naming its state. */
export function assertUploadUnchangedSinceSigning(
  options: Readonly<{
    planned: UploadFileRow;
    current: UploadFileRow;
    contentHash: string;
  }>,
): void {
  const { planned, current } = options;
  const isUnchanged =
    PRESIGNABLE_FILE_STATES.has(current.state) &&
    current.multipart_upload_id === planned.multipart_upload_id &&
    (current.content_hash === null ||
      current.content_hash === options.contentHash);
  if (!isUnchanged) {
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: current.state },
    });
  }
}
