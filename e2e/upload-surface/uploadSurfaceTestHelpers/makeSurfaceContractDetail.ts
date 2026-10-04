import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { makeUploadSessionDetail } from "../../../apps/web/src/testing/makeUploadSessionDetail.ts";

/**
 * Controlled contract state for frontend-only missing milestone/directory
 * paths.
 */
export function makeSurfaceContractDetail(): UploadSessionDetail {
  const detail = makeUploadSessionDetail();
  const files = Array.from({ length: 12 }, (_, position) => {
    return {
      fileId: `018f0000-0000-7000-8000-${(position + 100).toString(16).padStart(12, "0")}`,
      position,
      originalFilename: `Family-${position + 1}.jpg`,
      declaredContentType: "image/jpeg",
      declaredBytes: 1000,
      contentHash: null,
      state: "waiting" as const,
      attemptCount: 0,
      problemCode: null,
      problemDetail: null,
      capturedAt: "2026-09-17T12:00:00.000Z",
      capturedOn: "2026-09-17",
      captureOffsetMinutes: 0,
      captureSource: "exif" as const,
      itemId: null,
      media: null,
    };
  });
  return {
    ...detail,
    files,
    fileCount: 12,
    totalBytes: 12000,
    progress: { ...detail.progress, waitingCount: 12 },
    days: [{ capturedOn: "2026-09-17", fileCount: 12, milestones: [] }],
  };
}
