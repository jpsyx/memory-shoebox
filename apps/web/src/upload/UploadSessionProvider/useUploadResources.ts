import { createUploadDecodeCoordinator } from "@/upload/createUploadDecodeCoordinator";
import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { createUploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController";
import { createUploadFileIntake } from "@/upload/createUploadFileIntake/createUploadFileIntake";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UploadSessionResources } from "./UploadSessionProvider.types";
/** Stable resources; the StrictMode cleanup probe can cancel teardown. */
export function useUploadResources(memberId: string): UploadSessionResources {
  const queryClient = useQueryClient();
  const owner = useMemo(() => {
    const decodeCoordinator = createUploadDecodeCoordinator();
    const controller = createUploadSessionController({
      memberId,
      decodeCoordinator,
      onBurstChanged: () => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["timeline"] }),
          queryClient.invalidateQueries({ queryKey: ["bursts"] }),
          queryClient.invalidateQueries({
            queryKey: ["items"],
            refetchType: "none",
          }),
        ]);
      },
    });
    return {
      controller,
      previews: createUploadPreviewQueue({ decodeCoordinator }),
      decodeCoordinator,
      fileIntake: createUploadFileIntake(controller),
      lease: 0,
    };
  }, [memberId, queryClient]);
  useEffect(
    function ownUploadResources() {
      owner.lease += 1;
      return () => {
        const teardownLease = ++owner.lease;
        queueMicrotask(() => {
          if (owner.lease === teardownLease) {
            owner.fileIntake.clear();
            void owner.controller.discardDraft().catch(() => {});
            owner.controller.destroy();
            owner.previews.destroy();
            owner.decodeCoordinator.dispose();
          }
        });
      };
    },
    [owner],
  );
  return owner;
}
