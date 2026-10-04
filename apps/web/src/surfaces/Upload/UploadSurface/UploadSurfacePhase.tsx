import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { UploadDraft } from "../UploadDraft/UploadDraft";
import { UploadTransfer } from "../UploadTransfer/UploadTransfer";
import { UploadSelect } from "./UploadSelect";
import { UploadLoading } from "./UploadLoading";
import { UploadUnavailable } from "./UploadUnavailable";
import type { useUploadSurfaceState } from "./useUploadSurfaceState";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  viewer: Viewer;
  state: ReturnType<typeof useUploadSurfaceState>;
};
/** Renders one snapshot phase through the established leaf components. */
export function UploadSurfacePhase({
  snapshot,
  controller,
  previews,
  viewer,
  state,
}: Readonly<Props>): ReactNode {
  const isReading =
    snapshot.phase === "loading" ||
    snapshot.phase === "declaring" ||
    snapshot.phase === "checking";
  const isDraft = snapshot.detail?.state === "draft";
  return isReading && !isDraft ? (
    <UploadLoading snapshot={snapshot} />
  ) : snapshot.phase === "idle" ? (
    <UploadSelect
      choice={state.visibility}
      viewer={viewer}
      onChange={state.setVisibility}
      onPick={state.onPick}
    />
  ) : snapshot.phase === "unavailable" ? (
    <UploadUnavailable onRetry={state.onRetry} isDisabled={snapshot.isBusy} />
  ) : isDraft ? (
    <UploadDraft
      key={snapshot.detail!.sessionId}
      {...{ snapshot, controller, previews, viewer }}
      visibility={state.visibility}
      onVisibilityChange={state.setVisibility}
      onStart={state.onStart}
      onOpenMilestone={() => {
        state.setIsMilestoneOpen(true);
      }}
      onPick={state.onPick}
    />
  ) : snapshot.detail ? (
    <UploadTransfer
      snapshot={snapshot}
      controller={controller}
      onPick={state.onPick}
      onUploadMore={state.onUploadMore}
    />
  ) : null;
}
