import { useState } from "react";

/** Provides a local pending state and explicit retry after a burst save fails. */
export function useUploadBurstChange({
  onChange,
  isExcluded,
}: Readonly<{
  onChange?: (excluded: boolean) => Promise<void>;
  isExcluded: boolean;
}>): { isPending: boolean; hasError: boolean; onClick: () => void } {
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);
  return {
    isPending,
    hasError,
    onClick: () => {
      if (!onChange || isPending) {
        return;
      }
      setIsPending(true);
      setHasError(false);
      void onChange(!isExcluded)
        .catch(() => {
          setHasError(true);
        })
        .finally(() => {
          setIsPending(false);
        });
    },
  };
}
