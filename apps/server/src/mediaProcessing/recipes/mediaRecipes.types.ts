import type { RenditionPurpose } from "@memory-shoebox/shared";
import type { MediaProcessRunner } from "../runtime/createMediaProcessRunner.ts";
import type { MediaProbe } from "../runtime/mediaRuntime.types.ts";

/** Validated local file; publication and runner disposal belong to the caller. */
export type ProcessedRendition = {
  purpose: RenditionPurpose;
  path: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

/** One admitted job retains its runner, reader accounting and owned scratch. */
export type MediaRecipeInput = {
  sourcePathOrUrl: string;
  sourceBytes: number;
  probe: MediaProbe;
  runner: MediaProcessRunner;
  scratchDirectory: string;
  signal: AbortSignal;
};
