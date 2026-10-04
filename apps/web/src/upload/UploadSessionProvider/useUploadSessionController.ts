import { useContext } from "react";
import type { UploadSessionController } from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { UploadSessionContext } from "./UploadSessionContext";
function useUploadResources(): import("./UploadSessionProvider.types").UploadSessionResources {
  const resources = useContext(UploadSessionContext);
  if (!resources) {
    throw new Error("UploadSessionProvider is required.");
  }
  return resources;
}
/** The headless controller owned by the signed-in shell. */
export function useUploadSessionController(): UploadSessionController {
  return useUploadResources().controller;
}
/** The same preview queue used by every day in the active upload. */
export function useUploadPreviewQueue(): UploadPreviewQueue {
  return useUploadResources().previews;
}
