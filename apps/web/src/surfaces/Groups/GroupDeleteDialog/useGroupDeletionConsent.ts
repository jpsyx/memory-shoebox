import { useState } from "react";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import {
  isGroupConsentError,
  getGroupUsageFromConsentError,
} from "./groupConsentHelpers/groupConsentHelpers";
/**
 * Renewed deletion consequences and the operations that discard old consent.
 */
export type GroupDeletionConsent = {
  freshUsage: GroupUsageResponse | undefined;
  needsConfirmation: boolean;
  onFailed: (error: Error) => void;
  reset: () => void;
};
/**
 * Retains fresh server consequences until the user confirms or retries the
 * read.
 */
export function useGroupDeletionConsent(groupId: string): GroupDeletionConsent {
  const [freshUsage, setFreshUsage] = useState<GroupUsageResponse>();
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  return {
    freshUsage,
    needsConfirmation,
    onFailed: (error) => {
      if (isGroupConsentError(error)) {
        setFreshUsage(getGroupUsageFromConsentError({ error, groupId }));
        setNeedsConfirmation(true);
      }
    },
    reset: () => {
      setFreshUsage(undefined);
      setNeedsConfirmation(false);
    },
  };
}
