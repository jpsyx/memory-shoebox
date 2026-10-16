import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { APP_CONFIG } from "../../../../../app.config.ts";
import {
  checkMediaRecipeInput,
  getHeaderFromFile,
  getMediaRecipeErrorFromFailure,
  getByteSizeFromOwnedFile,
  makeImageRenditionsFromFile,
} from "./mediaRecipeFileHelpers.ts";
import type {
  MediaRecipeInput,
  ProcessedRendition,
} from "./mediaRecipes.types.ts";

async function _getSource(input: Readonly<MediaRecipeInput>): Promise<string> {
  const bytes = await getByteSizeFromOwnedFile({
    path: input.sourcePathOrUrl,
    directory: input.scratchDirectory,
  });
  if (
    bytes !== input.sourceBytes ||
    bytes > APP_CONFIG.mediaProcessing.photoInputBytes
  ) {
    throw new Error("processing_input_invalid");
  }
  const header = await getHeaderFromFile(input.sourcePathOrUrl);
  if (
    header.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    header
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP")
  ) {
    return input.sourcePathOrUrl;
  }
  if (header.toString("ascii", 4, 8) !== "ftyp") {
    throw new Error("processing_input_invalid");
  }
  if (!["heic", "heix", "mif1"].includes(header.toString("ascii", 8, 12))) {
    throw new Error("processing_input_invalid");
  }
  const path = join(input.scratchDirectory, "primary.png");
  const decoded = await input.runner.run({
    executable: "heif-thumbnailer",
    args: ["-p", "-s", "2048", input.sourcePathOrUrl, path],
    signal: input.signal,
    timeoutMs: APP_CONFIG.mediaProcessing.photoTimeoutMs,
    stdoutLimitBytes: 0,
  });
  if (decoded.exitCode !== 0) {
    throw new Error("processing_photo_recipe_failed");
  }
  return path;
}

/**
 * Makes local JPEG fallbacks and measured WebP candidates in one bounded job.
 */
export async function makePhotoRenditionsFromSource(
  input: Readonly<MediaRecipeInput>,
): Promise<ProcessedRendition[]> {
  const deadline = AbortSignal.timeout(
    APP_CONFIG.mediaProcessing.photoTimeoutMs,
  );
  const boundedInput = {
    ...input,
    signal: AbortSignal.any([input.signal, deadline]),
  };
  await checkMediaRecipeInput({ input: boundedInput, kind: "photo" });
  const outputDirectory = await mkdtemp(
    join(input.scratchDirectory, "output/photo-"),
  );
  try {
    const source = await _getSource(boundedInput);
    const outputs = await makeImageRenditionsFromFile({
      input: boundedInput,
      source,
      outputDirectory,
      candidates: APP_CONFIG.mediaProcessing.photoCandidates.map(
        (candidate, index) => {
          return {
            ...candidate,
            purpose: (["thumb", "display_small", "display"] as const)[index]!,
            webpPurpose: (
              [undefined, "display_small_webp", "display_webp"] as const
            )[index],
          };
        },
      ),
    });
    boundedInput.signal.throwIfAborted();
    return outputs;
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    if (input.signal.aborted) {
      throw new Error("processing_cancelled");
    }
    if (deadline.aborted) {
      throw new Error("processing_photo_timeout");
    }
    throw getMediaRecipeErrorFromFailure(error);
  }
}
