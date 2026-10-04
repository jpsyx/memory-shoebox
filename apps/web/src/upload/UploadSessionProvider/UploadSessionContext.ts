import { createContext } from "react";
import type { UploadSessionResources } from "./UploadSessionProvider.types";
/** Member-scoped upload resources, available throughout the signed-in shell. */
export const UploadSessionContext = createContext<
  UploadSessionResources | undefined
>(undefined);
