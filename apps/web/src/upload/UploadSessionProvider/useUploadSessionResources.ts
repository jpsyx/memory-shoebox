import { useContext } from "react";
import { UploadSessionContext } from "./UploadSessionContext";
import type { UploadSessionResources } from "./UploadSessionProvider.types";
/** Returns the shell's required upload controller and preview resources. */
export function useUploadSessionResources(): UploadSessionResources {
  const resources = useContext(UploadSessionContext);
  if (!resources) {
    throw new Error("UploadSessionProvider is required.");
  }
  return resources;
}
