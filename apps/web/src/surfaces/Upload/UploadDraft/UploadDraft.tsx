import { useRef, useState, type ReactNode } from "react";
import type {
  MemberRef,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { isFocusLostOrWithin } from "@/system/focusHelpers";
import { UploadLabelModal } from "../UploadLabelModal/UploadLabelModal";
import { UploadSelectionBar } from "./UploadSelectionBar";
import { UploadDraftContent } from "./UploadDraftContent";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  visibility: SetUploadVisibilityRequest;
  viewer: MemberRef;
  onVisibilityChange: (visibility: SetUploadVisibilityRequest) => void;
  onPick?: (files: readonly File[]) => void;
  onStart: () => void;
  onOpenMilestone: () => void;
};
function useUploadLabelChoice() {
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const [choice, setChoice] = useState({
    kind: "tag" as "tag" | "person",
    isOpened: false,
  });
  return {
    choice,
    onOpen: (kind: "tag" | "person") => {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
      setChoice({ kind, isOpened: true });
    },
    onClose: () => {
      setChoice((previousChoice) => {
        return { ...previousChoice, isOpened: false };
      });
      queueMicrotask(() => {
        if (
          isFocusLostOrWithin(
            document.querySelector("[role=dialog]") ?? undefined,
          )
        ) {
          const target = trigger.current?.isConnected
            ? trigger.current
            : document.querySelector<HTMLElement>(
                'main [aria-label^="Upload to"] h1',
              );
          if (target) {
            if (target !== trigger.current) target.tabIndex = -1;
            target.focus();
          }
        }
      });
    },
  };
}
/** Composes optional edits without making ticks a condition of upload. */
export function UploadDraft({
  snapshot,
  controller,
  previews,
  visibility,
  viewer,
  onVisibilityChange,
  onStart,
  onPick,
  onOpenMilestone,
}: Readonly<Props>): ReactNode {
  const labels = useUploadLabelChoice();
  return !snapshot.detail ? null : (
    <>
      <UploadSelectionBar
        snapshot={snapshot}
        controller={controller}
        onOpenLabel={labels.onOpen}
        onOpenMilestone={onOpenMilestone}
      />
      <UploadDraftContent
        snapshot={snapshot}
        controller={controller}
        previews={previews}
        visibility={visibility}
        viewer={viewer}
        onVisibilityChange={onVisibilityChange}
        onStart={onStart}
        onPick={onPick}
      />
      <UploadLabelModal
        memberId={viewer.memberId}
        key={labels.choice.kind}
        kind={labels.choice.kind}
        opened={labels.choice.isOpened}
        snapshot={snapshot}
        controller={controller}
        onClose={labels.onClose}
      />
    </>
  );
}
