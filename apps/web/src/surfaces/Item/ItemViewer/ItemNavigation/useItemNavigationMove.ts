import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type {
  ItemDirection,
  ItemNavigationContext,
  ItemNavigationTarget,
  ItemNavigationMovement,
} from "./itemNavigation.types";

type MoveOptions = {
  context: ItemNavigationContext;
  targets:
    | Partial<Record<ItemDirection, ItemNavigationTarget | undefined>>
    | undefined;
  isUnavailable: boolean;
};

type TargetNavigation = {
  context: ItemNavigationContext;
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
  await options.router.navigate({
    to: "/items/$itemId",
    params: { itemId },
    state: (state) => {
      return state;
    },
    replace: true,
    resetScroll: false,
  });
}

/** Serializes moves until the selected destination finishes loading. */
export function useItemNavigationMove(
  options: Readonly<MoveOptions>,
): ItemNavigationMovement {
  const router = useRouter();
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
        context: options.context,
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
