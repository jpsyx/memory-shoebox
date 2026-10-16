import { useRef, useState } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
type PhotoSourceFailure = {
  hasError: boolean;
  version: number;
  onError: () => void;
  retry: () => void;
};

/** One automatic retry per selected item; explicit retry starts a new epoch. */
export function usePhotoSourceFailure(
  options: Readonly<{
    itemId: string;
    renew: () => Promise<MediaRef | undefined>;
  }>,
): PhotoSourceFailure {
  const state = useRef({
    itemId: options.itemId,
    attempted: false,
    pending: false,
  });
  if (state.current.itemId !== options.itemId) {
    state.current = {
      itemId: options.itemId,
      attempted: false,
      pending: false,
    };
  }
  const [result, setResult] = useState({
    itemId: options.itemId,
    hasError: false,
    version: 0,
  });
  const attempt = async (manual: boolean) => {
    const captured = state.current;
    if (captured.pending) {
      return;
    }
    if (captured.attempted && !manual) {
      setResult((previous) => {
        return {
          ...previous,
          itemId: options.itemId,
          hasError: true,
        };
      });
      return;
    }
    captured.attempted = !manual;
    captured.pending = true;
    try {
      const media = await options.renew();
      if (state.current === captured) {
        setResult((previous) => {
          return {
            itemId: options.itemId,
            hasError: media === undefined,
            version: previous.version + 1,
          };
        });
      }
    } catch {
      if (state.current === captured) {
        setResult((previous) => {
          return {
            ...previous,
            itemId: options.itemId,
            hasError: true,
          };
        });
      }
    } finally {
      captured.pending = false;
    }
  };
  return {
    hasError: result.itemId === options.itemId && result.hasError,
    version: result.itemId === options.itemId ? result.version : 0,
    onError: () => {
      void attempt(false);
    },
    retry: () => {
      void attempt(true);
    },
  };
}
