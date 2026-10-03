import { useEffect, useEffectEvent, useRef } from "react";
import { isFocusLost } from "@/system/focus";

/**
 * Hands focus on once a comment's own delete has taken its row away.
 *
 * The row unmounting takes focus with it, from Delete or from the dialog that
 * asked, and drops it on the page behind. Its unmount is the first moment
 * that loss can be seen, so `onFocusLost` is called from there, and only when
 * focus really went: somebody who moved on while the delete was out keeps
 * their place.
 *
 * @returns What the delete calls once it has landed.
 */
export function useFocusAfterDelete(
  onFocusLost: (() => void) | undefined,
): () => void {
  const wasDeletedRef = useRef(false);
  const onRowGone = useEffectEvent(() => {
    if (wasDeletedRef.current && isFocusLost()) {
      onFocusLost?.();
    }
  });

  useEffect(function handFocusOnAsTheRowGoes() {
    return () => {
      onRowGone();
    };
  }, []);

  return () => {
    wasDeletedRef.current = true;
  };
}
