import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadMilestoneModal } from "../UploadMilestoneModal/UploadMilestoneModal";
import { UploadLoading } from "./UploadLoading";
import { UploadStateNotice } from "./UploadStateNotice/UploadStateNotice";
import { UploadSurfaceError } from "./UploadSurfaceError";
import { UploadSurfacePhase } from "./UploadSurfacePhase";
import type { useUploadSurfaceState } from "./useUploadSurfaceState";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  viewer: Viewer;
  state: ReturnType<typeof useUploadSurfaceState>;
};
/** Composes the approved phases while retaining the active occasion attempt. */
export function UploadSurfaceBody({
  snapshot,
  controller,
  previews,
  viewer,
  state,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="lg">
      <UploadStateNotice phase={snapshot.phase} />
      <UploadSurfaceError
        snapshot={snapshot}
        controller={controller}
        onRetry={state.onRetry}
      />
      {snapshot.detail?.state === "draft" &&
      (snapshot.phase === "loading" ||
        snapshot.phase === "declaring" ||
        snapshot.phase === "checking") ? (
        <UploadLoading snapshot={snapshot} />
      ) : null}
      <UploadSurfacePhase
        snapshot={snapshot}
        controller={controller}
        previews={previews}
        viewer={viewer}
        state={state}
      />
      {snapshot.detail ? (
        <UploadMilestoneModal
          key={snapshot.detail.sessionId}
          memberId={viewer.memberId}
          opened={state.isMilestoneOpen && snapshot.detail.state === "draft"}
          snapshot={snapshot}
          controller={controller}
          onClose={() => {
            state.setIsMilestoneOpen(false);
          }}
        />
      ) : null}
    </Stack>
  );
}
