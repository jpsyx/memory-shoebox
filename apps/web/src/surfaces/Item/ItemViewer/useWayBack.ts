import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";

/** The way out of an item, and the two ways it is taken. */
export type WayBack = {
  /** For the back link: history when there is some, else the link's href. */
  onBackClick: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  /** For a delete: the same way out, taken without a press. */
  leave: () => void;
};

/**
 * The way back to the pile (decision 5).
 *
 * With history inside the app, Back is history, which lands on the pile with
 * its filter and its scroll offset exactly as they were. Arriving from a
 * pasted link or an email there is none, so the back link's own href takes
 * over, which is the day the item was taken.
 */
export function useWayBack(capturedOn: string): WayBack {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const navigate = useNavigate();
  return {
    onBackClick: canGoBack
      ? (event) => {
          event.preventDefault();
          router.history.back();
        }
      : undefined,
    leave: () => {
      if (canGoBack) {
        router.history.back();
        return;
      }
      void navigate({ to: "/", search: { at: capturedOn }, replace: true });
    },
  };
}
