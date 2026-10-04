import type { UploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useUploadSessionResources } from "./useUploadSessionResources";
/** Returns the headless controller owned by the signed-in shell. */
export function useUploadSessionController(): UploadSessionController {
  return useUploadSessionResources().controller;
}
