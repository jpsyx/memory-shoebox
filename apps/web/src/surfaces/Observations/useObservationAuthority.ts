import { useEffect } from "react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import { isObservationAuthorityError } from "./isObservationAuthorityError";
/**
 * Rechecks refused authority once per failed read, exposing recheck failure.
 */
export function useObservationAuthority(
  error: Error | undefined,
): UseMutationResult<void, Error, void> {
  const refresh = useRefreshMemberAuthority();
  const check = useMutation({ mutationFn: refresh });
  const { mutate } = check;
  useEffect(
    function recheckRefusedObservationAuthority() {
      if (isObservationAuthorityError(error)) {
        mutate();
      }
    },
    [error, mutate],
  );
  return check;
}
