import { useSyncExternalStore } from "react";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
/** Subscribes to the controller's stable published snapshot. */
export function useUploadSnapshot(
  controller: UploadSessionController,
): UploadSnapshot {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
