import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { useState } from "react";
import type { SetupDraft } from "../../../setupFlow.types";

/** Tracks creation failures and associates validation errors with fields. */
export function useCreationFailure(onInvalid: SetupDraft["onInvalid"]): {
  error: string | undefined;
  onError: (failure: unknown) => void;
  clearError: () => void;
} {
  const [error, setError] = useState<string>();
  const onError = (failure: unknown) => {
    if (
      failure instanceof ApiRequestError &&
      failure.code === "invalid_request"
    ) {
      const errors = Object.fromEntries(
        Object.entries(failure.details?.fieldErrors ?? {}).map(
          ([field, messages]) => {
            return [field, messages[0]];
          },
        ),
      );
      if (Object.keys(errors).length > 0) {
        onInvalid(errors);
        return;
      }
    }
    setError(
      "Could not create your Shoebox. Check your connection and try again.",
    );
  };
  return {
    error,
    onError,
    clearError: () => {
      setError(undefined);
    },
  };
}
