import type { UploadSessionDetail } from "@memory-shoebox/shared";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";

/** Two uncertain dates interspersed with independently dated photographs. */
export function makeDateReviewDetail(): UploadSessionDetail {
  const files = ["2026-09-14", undefined, "2026-09-16", undefined].map(
    (day, position) => {
      return {
        ...makeUploadFileFromPosition(position),
        position: position + 1,
        capturedOn: day ?? "2026-10-10",
        captureSource: day ? ("exif" as const) : ("file_mtime" as const),
      };
    },
  );
  return makeUploadSurfaceDetail({
    files,
    fileCount: 4,
    undated: {
      fileCount: 2,
      captureSource: "file_mtime",
      files: [files[1]!, files[3]!].map((file) => {
        return {
          fileId: file.fileId,
          originalFilename: file.originalFilename,
          capturedOn: file.capturedOn,
        };
      }),
    },
  });
}
