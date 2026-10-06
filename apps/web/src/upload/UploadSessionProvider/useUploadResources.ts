import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { createUploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController";
import { createUploadFileIntake } from "@/upload/createUploadFileIntake/createUploadFileIntake";
import { useEffect, useMemo } from "react";
import type { UploadSessionResources } from "./UploadSessionProvider.types";
import { useUploadSnapshot } from "./useUploadSnapshot";
/** Stable resources; the StrictMode cleanup probe can cancel teardown. */
export function useUploadResources(memberId: string): UploadSessionResources {
  const owner = useMemo(() => {
    const controller = createUploadSessionController({ memberId });
    return {
      controller,
      previews: createUploadPreviewQueue(),
      fileIntake: createUploadFileIntake(controller),
      lease: 0,
    };
  }, [memberId]);
  const snapshot = useUploadSnapshot(owner.controller);
  useEffect(
    function ownUploadResources() {
      owner.lease += 1;
      return () => {
        const teardownLease = ++owner.lease;
        queueMicrotask(() => {
          if (owner.lease === teardownLease) {
            owner.controller.destroy();
            owner.previews.destroy();
          }
        });
      };
    },
    [owner],
  );
  useEffect(
    function pauseUploadPreviews() {
      owner.previews.setPaused(snapshot.isRunning);
    },
    [owner, snapshot.isRunning],
  );
  return owner;
}
