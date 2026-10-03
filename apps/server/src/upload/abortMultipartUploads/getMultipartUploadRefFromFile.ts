import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type { MultipartUploadRef } from "./abortMultipartUploads.types.ts";

/**
 * The open multipart upload a row holds, or undefined when it holds none.
 *
 * @param file The row, or the columns of it a `RETURNING` gave back.
 */
export function getMultipartUploadRefFromFile(
  file: Readonly<
    Pick<UploadFileRow, "id" | "storage_key" | "multipart_upload_id">
  >,
): MultipartUploadRef | undefined {
  return file.storage_key === null || file.multipart_upload_id === null
    ? undefined
    : {
        fileId: file.id,
        storageKey: file.storage_key,
        multipartUploadId: file.multipart_upload_id,
      };
}
