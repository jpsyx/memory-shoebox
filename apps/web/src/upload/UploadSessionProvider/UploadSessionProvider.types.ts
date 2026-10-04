import type { UploadSessionController } from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
/** Resources owned by one signed-in member's shell. */
export type UploadSessionResources = {
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};
