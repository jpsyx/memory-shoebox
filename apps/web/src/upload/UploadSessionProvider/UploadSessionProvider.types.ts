import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { createUploadFileIntake } from "@/upload/createUploadFileIntake/createUploadFileIntake";
/** Resources owned by one signed-in member's shell. */
export type UploadSessionResources = {
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  fileIntake: ReturnType<typeof createUploadFileIntake>;
};
