import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { getSelectedSourceFromPreview } from "@/media/getSelectedSourceFromPreview";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type {
  ItemDirection,
  ItemNavigationContext,
  ItemNavigationMovement,
  ItemNavigationTarget,
} from "./itemNavigation.types";

type TargetNavigation = {
  resources: MediaLoadingResources;
  target: ItemNavigationTarget;
  direction: ItemDirection;
  router: ReturnType<typeof useRouter>;
  sourceLocation: ReturnType<typeof useRouter>["state"]["location"];
};

async function _navigateToTarget(
  options: Readonly<TargetNavigation>,
): Promise<void> {
  const itemId = options.target.itemId;
  if (options.router.state.location !== options.sourceLocation) {
    return;
  }
  const release = options.resources.navigation.prepare({
    itemId,
    direction: options.direction,
    source: getSelectedSourceFromPreview({
      preview: options.resources.previews.read(itemId),
      viewport: options.resources.navigation.viewport,
    }),
  });
  try {
    await options.router.navigate({
      to: "/items/$itemId",
      params: { itemId },
      state: (state) => {
        return state;
      },
      replace: true,
      resetScroll: false,
    });
  } catch (failure) {
    release();
    throw failure;
  } finally {
    options.resources.navigation.complete(release);
  }
}

/** Serializes moves until the selected destination finishes loading. */
export function useItemNavigationMove(
  options: Readonly<{
    context: ItemNavigationContext;
    targets:
      | Partial<Record<ItemDirection, ItemNavigationTarget | undefined>>
      | undefined;
    isUnavailable: boolean;
  }>,
): ItemNavigationMovement {
  const router = useRouter();
  const resources = useMediaLoading();
  const pending = useRef(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string>();
  const move = async (direction: ItemDirection) => {
    const target = options.targets?.[direction];
    if (pending.current || options.isUnavailable || target === undefined) {
      return;
    }
    const sourceLocation = router.state.location;
    pending.current = true;
    setIsMoving(true);
    setError(undefined);
    try {
      await _navigateToTarget({
        resources,
        target,
        direction,
        router,
        sourceLocation,
      });
    } catch {
      setError("Could not open that photo or video. Try again.");
    } finally {
      pending.current = false;
      setIsMoving(false);
    }
  };
  return {
    isMoving,
    error,
    move,
    clearError: () => {
      setError(undefined);
    },
  };
}
