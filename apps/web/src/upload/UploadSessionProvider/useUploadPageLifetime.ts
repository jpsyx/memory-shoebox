import { useEffect, useRef } from "react";
import type { UploadSessionResources } from "./UploadSessionProvider.types";

function _discardUnstartedUpload(
  resources: Readonly<UploadSessionResources>,
): void {
  const fileIds = [...resources.controller.getSnapshot().filesById.keys()];
  resources.fileIntake.clear();
  void resources.controller.discardDraft().catch(() => {});
  if (resources.controller.getSnapshot().phase === "idle") {
    fileIds.forEach((fileId) => {
      resources.previews.release(fileId);
    });
  }
}

/** Discards local drafts on route exit or page hide, preserving armed uploads. */
export function useUploadPageLifetime(
  resources: Readonly<UploadSessionResources>,
): void {
  const lease = useRef(0);
  useEffect(
    function ownUploadPage() {
      lease.current += 1;
      const onPageHide = () => {
        _discardUnstartedUpload(resources);
      };
      window.addEventListener("pagehide", onPageHide);
      return () => {
        window.removeEventListener("pagehide", onPageHide);
        const cleanupLease = ++lease.current;
        queueMicrotask(() => {
          if (lease.current === cleanupLease) {
            _discardUnstartedUpload(resources);
          }
        });
      };
    },
    [resources],
  );
}
