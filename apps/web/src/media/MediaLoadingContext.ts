import { createContext, useContext } from "react";
import type { MediaLoadingResources } from "./createMediaLoadingResources";

/** Private media resources for the current signed-in member. */
export const MediaLoadingContext = createContext<
  MediaLoadingResources | undefined
>(undefined);

/** Reads the current provider without mixing in the actual-detail cache. */
export function useMediaLoading(): MediaLoadingResources {
  const resources = useContext(MediaLoadingContext);
  if (resources === undefined) {
    throw new Error("MediaLoadingProvider is required");
  }
  return resources;
}
