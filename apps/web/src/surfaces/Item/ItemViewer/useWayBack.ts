import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";

/** The way out of an item, and the two ways it is taken. */
export type WayBack = {
  /** The pile's search for the back link's own href: one day, or none. */
  search: { at?: string };
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
 * over: the day the item was taken, or the whole pile when there is no item
 * to read a day off (not here, still loading, or failed).
 */
export function useWayBack(capturedOn: string | undefined): WayBack {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const navigate = useNavigate();
  const search = capturedOn === undefined ? {} : { at: capturedOn };
  return {
    search,
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
      void navigate({ to: "/", search, replace: true });
    },
  };
}
