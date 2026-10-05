import { useRef, useState, type RefObject } from "react";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";

/** Selected action and the directory target used when its trigger disappears. */
export type MemberSelection = {
  action: MemberAction | undefined;
  onAction: (action: MemberAction) => void;
  onClose: () => void;
  directoryRef: RefObject<HTMLDivElement | null>;
};

/** Restores focus after the conditional dialog unmounts on cancel or success. */
export function useMemberSelection(): MemberSelection {
  const [action, setAction] = useState<MemberAction | undefined>();
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const directoryRef = useRef<HTMLDivElement>(null);
  const onAction = (selected: MemberAction) => {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    setAction(selected);
  };
  const onClose = () => {
    const originalTrigger = trigger.current;
    setAction(undefined);
    requestAnimationFrame(() => {
      if (
        originalTrigger?.isConnected &&
        !originalTrigger.matches(":disabled")
      ) {
        originalTrigger.focus();
      } else {
        directoryRef.current?.focus();
      }
    });
  };
  return { action, onAction, onClose, directoryRef };
}
