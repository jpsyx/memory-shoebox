import { useRef, useState, type RefObject } from "react";
import type { AdminGroupDto } from "@memory-shoebox/shared";
/**
 * The selected action owns its original trigger for keyboard focus restoration.
 */
export type GroupSelection = { kind: "edit" | "delete"; group: AdminGroupDto };
/** State shared by the directory and its focused dialogs. */
export type GroupSelectionState = {
  selection: GroupSelection | undefined;
  isCreating: boolean;
  directoryRef: RefObject<HTMLDivElement | null>;
  onAction: (action: GroupSelection) => void;
  onCreate: () => void;
  onClose: () => void;
};

/**
 * Restores exact triggers or a meaningful directory fallback when a row is
 * gone.
 */
export function useGroupSelection(): GroupSelectionState {
  const [selection, setSelection] = useState<GroupSelection>();
  const [isCreating, setIsCreating] = useState(false);
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const directoryRef = useRef<HTMLDivElement>(null);
  const captureTrigger = () => {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
  };
  const onAction = (action: GroupSelection) => {
    captureTrigger();
    setSelection(action);
  };
  const onCreate = () => {
    captureTrigger();
    setIsCreating(true);
  };
  const onClose = () => {
    const originalTrigger = trigger.current;
    setSelection(undefined);
    setIsCreating(false);
    requestAnimationFrame(() => {
      if (originalTrigger?.isConnected) {
        originalTrigger.focus();
      } else {
        directoryRef.current?.focus();
      }
    });
  };
  return { selection, isCreating, directoryRef, onAction, onCreate, onClose };
}
