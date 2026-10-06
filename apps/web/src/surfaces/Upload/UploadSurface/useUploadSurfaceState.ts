import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useUploadSessionResources } from "@/upload/UploadSessionProvider/useUploadSessionResources";
import { useUploadAddress } from "./useUploadAddress";
import { useUploadVisibilityChoice } from "./useUploadVisibilityChoice";
type Options = {
  controller: UploadSessionController;
  snapshot: UploadSnapshot;
  sessionId?: string;
  isAllowed: boolean;
};
type SurfaceState = {
  visibility: import("@memory-shoebox/shared").SetUploadVisibilityRequest;
  setVisibility: import("react").Dispatch<
    import("react").SetStateAction<
      import("@memory-shoebox/shared").SetUploadVisibilityRequest
    >
  >;
  isMilestoneOpen: boolean;
  setIsMilestoneOpen: import("react").Dispatch<
    import("react").SetStateAction<boolean>
  >;
  onUploadMore: () => void;
  onPick: (files: readonly File[]) => void;
  onStart: () => void;
  onRetry: () => void;
};
/**
 * Surface form choices and explicit controller actions, without transfer
 * effects.
 */
export function useUploadSurfaceState({
  controller,
  snapshot,
  sessionId,
  isAllowed,
}: Readonly<Options>): SurfaceState {
  const navigate = useNavigate();
  const { fileIntake } = useUploadSessionResources();
  useUploadAddress({ controller, snapshot, sessionId, isAllowed });
  const { visibility, setVisibility } = useUploadVisibilityChoice(snapshot);
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const onUploadMore = () => {
    controller.reset();
    setVisibility({ mode: "everyone", subjects: [] });
    setIsMilestoneOpen(false);
    void navigate({ to: "/upload", search: {}, replace: true });
  };
  return {
    visibility,
    setVisibility,
    isMilestoneOpen,
    setIsMilestoneOpen,
    onUploadMore,
    onPick: (files: readonly File[]) => {
      void controller.pickFiles(files).catch(() => {});
    },
    onStart: () => {
      void controller.startUpload(visibility).catch(() => {});
    },
    onRetry: () => {
      const address = sessionId ?? snapshot.detail?.sessionId;
      const retry =
        snapshot.error?.operation === "declare"
          ? controller.pickFiles([]).then(() => {
              if (fileIntake.getPendingFileCount() > 0) {
                return fileIntake.loadSession(address);
              }
              return undefined;
            })
          : fileIntake.loadSession(address);
      void retry.catch(() => {});
    },
  };
}
