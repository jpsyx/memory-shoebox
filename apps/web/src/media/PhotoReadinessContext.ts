import { createContext } from "react";
import type { PhotoViewport } from "./photoViewport";

/** Readiness belongs to an exact selected source and measured viewport. */
export type ViewerReadiness = {
  itemId: string;
  sourceKey: string;
  viewport: PhotoViewport;
  photosReady: boolean;
};
/** Photo decode reports to its viewer without changing PhotoFrame's public props. */
export const PhotoReadinessContext = createContext<
  ((state: ViewerReadiness | undefined) => void) | undefined
>(undefined);

/** The toolbar consumes readiness from the displayed media only. */
export const ViewerReadinessContext = createContext<
  ViewerReadiness | undefined
>(undefined);
