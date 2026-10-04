import { isFocusLostOrWithin } from "@/system/focusHelpers";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type {
  MemberRef,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import { useRef, useState, type ReactNode } from "react";
import { UploadLabelModal } from "../UploadLabelModal/UploadLabelModal";
import { UploadDraftContent } from "./UploadDraftContent";
import { UploadSelectionBar } from "./UploadSelectionBar/UploadSelectionBar";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  visibility: SetUploadVisibilityRequest;
  viewer: MemberRef;
  onVisibilityChange: (
    visibility: Readonly<SetUploadVisibilityRequest>,
  ) => void;
  onPick?: (files: readonly File[]) => void;
  onStart: () => void;
  onOpenMilestone: () => void;
};
function _restoreLabelFocus(trigger: HTMLElement | undefined): void {
  if (
    isFocusLostOrWithin(document.querySelector("[role=dialog]") ?? undefined)
  ) {
    const target = trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLElement>(
          'main [aria-label^="Upload to"] h1',
        );
    if (target) {
      if (target !== trigger) {
        target.tabIndex = -1;
      }
      target.focus();
    }
  }
}
function useUploadLabelChoice(): {
  choice: { kind: "tag" | "person"; isOpened: boolean };
  onOpen: (kind: "tag" | "person") => void;
  onClose: () => void;
} {
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
        _restoreLabelFocus(trigger.current);
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
