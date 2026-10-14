import { useEffect, useMemo } from "react";
import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
  type MediaLoadingResources,
} from "./createMediaLoadingResources";

const LIFETIME = createMediaLoadingLifetime();

/** Retires private state immediately; StrictMode may reacquire the owner. */
export function useMediaLoadingResources(
  memberId: string,
): MediaLoadingResources {
  const owner = useMemo(() => {
    return {
      resources: createMediaLoadingResources({ memberId, lifetime: LIFETIME }),
      lease: 0,
    };
  }, [memberId]);
  const { resources } = owner;
  useEffect(() => {
    owner.lease += 1;
    return () => {
      resources.clearMember();
      const teardownLease = ++owner.lease;
      queueMicrotask(() => {
        if (owner.lease === teardownLease) {
          resources.dispose();
        }
      });
    };
  }, [owner, resources]);
  return resources;
}
