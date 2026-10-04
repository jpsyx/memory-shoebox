import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { useUploadSessionResources } from "./useUploadSessionResources";
/** Returns the shared preview queue for the active upload. */
export function useUploadPreviewQueue(): UploadPreviewQueue {
  return useUploadSessionResources().previews;
}
