import {
  type DerivativePurpose,
  type MadeDerivative,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

/** Inputs for _decodeImage. */
export type DecodeImageOptions = {
  file: Blob;
  contentType: string;
  size: PixelSize | undefined;
  decodeSize: PixelSize | undefined;
  plan: DerivativeTarget[];
};

/** One derivative still to make, and the long edge it is made at. */
export type DerivativeTarget = {
  purpose: DerivativePurpose;
  longEdgePx: number;
};

/** What `makeImageDerivatives` hands back to the worker. */
export type ImageDerivativesResult = {
  derivatives: MadeDerivative[];
  /**
   * True when libheif was tried, whether or not it succeeded. That is what
   * the recycling counts: a failed attempt can still have grown the
   * WebAssembly heap, which never shrinks.
   */
  usedWasmDecoder: boolean;
  /**
   * The original's displayed size: the header's, or the decoder's when the
   * header had none. What `complete` sends as the file's width and height.
   */
  originalSize: PixelSize | undefined;
  /**
   * Why a derivative was dropped, in a short English clause. Present only
   * when one was planned and could not be made: a derivative skipped because
   * the original already is one has no detail. For the admin's eye.
   */
  dropDetail?: string;
};

/**
 * What decoding came to: the picture, or why there is none. Either way it
 * says whether libheif was tried, which the recycling counts.
 */
export type DecodeAttempt =
  | {
      kind: "decoded";
      image: { bitmap: ImageBitmap; originalSize: PixelSize };
      usedWasmDecoder: boolean;
    }
  | { kind: "failed"; dropDetail: string; usedWasmDecoder: boolean };

/** The derivatives made so far, and the purposes that could not be. */
export type EncodeProgress = {
  derivatives: MadeDerivative[];
  droppedPurposes: DerivativePurpose[];
};
