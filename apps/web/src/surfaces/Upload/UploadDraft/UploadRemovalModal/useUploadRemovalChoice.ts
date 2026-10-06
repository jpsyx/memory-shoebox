import { isFocusLostOrWithin } from "@/system/focusHelpers";
import { useRef, useState } from "react";

type RemovalChoice = {
  fileIds: readonly string[];
  onOpen: (targets: readonly string[], source: HTMLElement) => void;
  onClose: () => void;
};

/** Freezes removal targets and restores focus when confirmation closes. */
export function useUploadRemovalChoice(): RemovalChoice {
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const [fileIds, setFileIds] = useState<readonly string[]>([]);
  return {
    fileIds,
    onOpen: (targets: readonly string[], source: HTMLElement) => {
      trigger.current = source;
      setFileIds([...targets]);
    },
    onClose: () => {
      setFileIds([]);
      queueMicrotask(() => {
        if (
          !isFocusLostOrWithin(
            document.querySelector("[role=dialog]") ?? undefined,
          )
        ) {
          return;
        }
        const target = trigger.current?.isConnected
          ? trigger.current
          : document.querySelector<HTMLElement>(
              'main [aria-label^="Upload to"] h1',
            );
        if (target) {
          if (target !== trigger.current) {
            target.tabIndex = -1;
          }
          target.focus();
        }
      });
    },
  };
}
