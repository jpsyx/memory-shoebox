import { useEffect, useMemo } from "react";
import { createUploadSessionController } from "@/upload/uploadSessionController/uploadSessionController";
import { createUploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers";
import { useUploadSnapshot } from "./useUploadSnapshot";
import type { UploadSessionResources } from "./UploadSessionProvider.types";
/** Stable resources; the StrictMode cleanup probe can cancel teardown. */
export function useUploadResources(memberId: string): UploadSessionResources {
  const owner = useMemo(() => {
    return {
      controller: createUploadSessionController({ memberId }),
      previews: createUploadPreviewQueue(),
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
