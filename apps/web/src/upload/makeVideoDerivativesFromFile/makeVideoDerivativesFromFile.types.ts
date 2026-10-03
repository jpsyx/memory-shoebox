import {
  type MadeDerivative,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

/** Inputs for _makeDerivativeFromVideo. */
export type MakeDerivativeFromVideoOptions = {
  purpose: "poster" | "thumb";
  size: PixelSize;
  video: HTMLVideoElement;
  quality: number;
  signal: AbortSignal;
};

/** What `makeVideoDerivatives` hands back to the engine. */
export type VideoDerivativesResult = {
  derivatives: MadeDerivative[];
  /** The decoder's own size, which already includes the track's rotation. */
  size: PixelSize | undefined;
};
