import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useSyncExternalStore } from "react";
/** Subscribes to the controller's stable published snapshot. */
export function useUploadSnapshot(
  controller: Readonly<UploadSessionController>,
): UploadSnapshot {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
