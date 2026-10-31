import { idSchema } from "@memory-shoebox/shared";
import { useRouter } from "@tanstack/react-router";
import { useContext, useEffect, useRef } from "react";
import { MediaLoadingContext } from "../MediaLoadingContext";
import { getPrefetchEnvironmentFromBrowser } from "../mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";

type IntentHandlers = {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onTouchStart: () => void;
};

/** Dwelled viewing intent shares metadata, image budgets and member lifetime. */
export function useMediaIntent(itemId: string, enabled = true): IntentHandlers {
  const resources = useContext(MediaLoadingContext);
  const router = useRouter({ warn: false });
  const release = useRef<(() => void) | undefined>(undefined);
  const cancel = () => {
    release.current?.();
    release.current = undefined;
  };
  useEffect(() => {
    return cancel;
  }, [itemId, resources, enabled]);
  const enter = (immediate = false) => {
    if (!enabled || !resources || !idSchema.safeParse(itemId).success) {
      return;
    }
    const environment = getPrefetchEnvironmentFromBrowser({
      memberId: resources.memberId,
      selectionKey: itemId,
    });
    if (
      !environment.visible ||
      environment.saveData ||
      ["slow-2g", "2g"].includes(environment.effectiveType)
    ) {
      return;
    }
    void router
      ?.preloadRoute({ to: "/items/$itemId", params: { itemId } })
      .catch(() => {});
    release.current = resources.intent.enter(itemId, immediate);
  };
  return {
    onPointerEnter: () => {
      return enter();
    },
    onPointerLeave: cancel,
    onFocus: () => {
      return enter();
    },
    onBlur: cancel,
    onPointerDown: () => {
      return enter(true);
    },
    onTouchStart: () => {
      return enter(true);
    },
  };
}
