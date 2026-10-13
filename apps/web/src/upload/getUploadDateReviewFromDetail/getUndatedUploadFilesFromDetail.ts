import type {
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";

/** Waiting files the server still identifies as lacking a capture date. */
export function getUndatedUploadFilesFromDetail(
  detail: Readonly<UploadSessionDetail>,
): UploadFileDto[] {
  const undatedIds = new Set(
    detail.undated?.files.map((file) => {
      return file.fileId;
    }),
  );
  return detail.files.filter((file) => {
    return (
      undatedIds.has(file.fileId) &&
      file.state === "waiting" &&
      !file.duplicateReason
    );
  });
}
