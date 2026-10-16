import { idSchema } from "@memory-shoebox/shared";
import { useRouter } from "@tanstack/react-router";
import { useContext, useRef } from "react";
import type { MediaLoadingResources } from "./createMediaLoadingResources/createMediaLoadingResources";
import { MediaLoadingContext } from "./MediaLoadingContext";
import { getPrefetchEnvironmentFromBrowser } from "./mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";
function _hasFreshPreview({
  resources,
  itemId,
}: {
  resources: MediaLoadingResources;
  itemId: string;
}): boolean {
  const known = resources.previews.read(itemId);
  const sources =
    known === undefined
      ? []
      : [
          ...known.media.displayCandidates,
          known.media.display,
          known.media.poster,
        ].filter((source) => {
          return source !== null;
        });
  return sources.some((source) => {
    return Date.parse(source.expiresAt) > Date.now() + 60_000;
  });
}

function _isIntentAllowed({
  memberId,
  itemId,
}: {
  memberId: string;
  itemId: string;
}): boolean {
  const environment = getPrefetchEnvironmentFromBrowser({
    memberId,
    selectionKey: itemId,
  });
  return (
    environment.visible &&
    !environment.saveData &&
    !["slow-2g", "2g"].includes(environment.effectiveType)
  );
}

/** Pointer, focus and touch warm only safe metadata and route code. */
export function useMediaIntent(itemId: string): {
  onPointerEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
} {
  const resources = useContext(MediaLoadingContext);
  const router = useRouter({ warn: false });
  const pending = useRef<string | undefined>(undefined);
  const onIntent = () => {
    if (resources === undefined || !idSchema.safeParse(itemId).success) {
      return;
    }
    if (!_isIntentAllowed({ memberId: resources.memberId, itemId })) {
      return;
    }
    void router
      ?.preloadRoute({ to: "/items/$itemId", params: { itemId } })
      .catch(() => {});
    if (pending.current === itemId || _hasFreshPreview({ resources, itemId })) {
      return;
    }
    pending.current = itemId;
    void resources
      .readPreviews({
        request: { itemIds: [itemId], purpose: "speculative-preview" },
      })
      .catch(() => {})
      .finally(() => {
        if (pending.current === itemId) {
          pending.current = undefined;
        }
      });
  };
  return {
    onPointerEnter: onIntent,
    onFocus: onIntent,
    onTouchStart: onIntent,
  };
}
