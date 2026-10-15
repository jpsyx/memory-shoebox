import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { appConfig } from "../../../../../app.config.ts";
import { getMediaAdmissionFromProbe } from "../runtime/getMediaAdmissionFromProbe.ts";
import type {
  MediaRecipeInput,
  ProcessedRendition,
} from "./mediaRecipes.types.ts";

const RENDITIONS = z
  .array(
    z.object({
      purpose: z.enum([
        "thumb",
        "poster",
        "display",
        "display_small",
        "display_webp",
        "display_small_webp",
      ]),
      path: z.string(),
      contentType: z.enum(["image/jpeg", "image/webp"]),
      byteSize: z.number().int().positive(),
      width: z.number().int().positive().max(2048),
      height: z.number().int().positive().max(2048),
    }),
  )
  .min(1)
  .max(5);

/** Refuses a mismatched job or inadmissible metadata before launching a tool. */
export async function checkMediaRecipeInput(
  input: Readonly<MediaRecipeInput>,
  kind: "photo" | "video",
): Promise<void> {
  input.signal.throwIfAborted();
  if (
    input.scratchDirectory !== input.runner.scratchPath ||
    !isAbsolute(input.scratchDirectory) ||
    (await realpath(input.scratchDirectory)) !== input.scratchDirectory ||
    (await realpath(join(input.scratchDirectory, "output"))) !==
      join(input.scratchDirectory, "output")
  ) {
    throw new Error("processing_scratch_unavailable");
  }
  const admission = getMediaAdmissionFromProbe(input);
  if (!admission.admitted || input.probe.kind !== kind) {
    throw new Error(admission.reason ?? "processing_input_invalid");
  }
}

/** Checks real, owned regular files without following symlinks. */
export async function getOwnedFileBytes(
  options: Readonly<{ path: string; directory: string }>,
): Promise<number> {
  const suffix = relative(options.directory, options.path);
  if (
    !suffix ||
    suffix.startsWith("..") ||
    isAbsolute(suffix) ||
    (await realpath(options.path)) !== options.path
  ) {
    throw new Error("processing_input_invalid");
  }
  const metadata = await lstat(options.path);
  if (!metadata.isFile() || metadata.size <= 0) {
    throw new Error("processing_input_invalid");
  }
  return metadata.size;
}

/** Reads only a small header, leaving compressed media out of the API heap. */
export async function getHeaderFromFile(path: string): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(32);
    await file.read(header, 0, 32, 0);
    return header;
  } finally {
    await file.close();
  }
}

type ImageRecipeOptions = {
  input: MediaRecipeInput;
  source: string;
  outputDirectory: string;
  candidates: Array<{
    purpose: "thumb" | "poster" | "display_small" | "display";
    longEdge: number;
    bytes: number;
    webpPurpose?: "display_webp" | "display_small_webp";
  }>;
};

async function _checkImageOutputs(
  outputs: readonly ProcessedRendition[],
  directory: string,
): Promise<void> {
  const sizes = await Promise.all(
    outputs.map(async (output) => {
      const size = await getOwnedFileBytes({ path: output.path, directory });
      if (size !== output.byteSize) {
        throw new Error("processing_output_invalid");
      }
      return size;
    }),
  );
  if (
    sizes.reduce((sum, size) => {
      return sum + size;
    }, 0) > appConfig.mediaProcessing.outputBytes
  ) {
    throw new Error("processing_disk_limit");
  }
}

/** Sharp is imported only in this runner-owned child, never in Fastify. */
export async function makeImageRenditionsFromFile(
  options: Readonly<ImageRecipeOptions>,
): Promise<ProcessedRendition[]> {
  const { input, ...childOptions } = options;
  const result = await input.runner.run({
    executable: process.execPath,
    args: [
      fileURLToPath(new URL("./runPhotoRecipeChild.ts", import.meta.url)),
      JSON.stringify({
        ...childOptions,
        measurementPath: join(
          input.scratchDirectory,
          "photo-measurements.json",
        ),
      }),
    ],
    signal: input.signal,
    timeoutMs: appConfig.mediaProcessing.photoTimeoutMs,
    stdoutLimitBytes: appConfig.mediaProcessing.probeMetadataBytes,
  });
  if (result.exitCode !== 0) {
    throw new Error("processing_photo_recipe_failed");
  }
  const outputs = RENDITIONS.parse(JSON.parse(result.stdout));
  await _checkImageOutputs(outputs, options.outputDirectory);
  return outputs;
}

/** Keeps decoder and validation failures out of user-visible diagnostics. */
export function getMediaRecipeErrorFromFailure(error: unknown): Error {
  return error instanceof Error && /^processing_[a-z_]+$/.test(error.message)
    ? error
    : new Error("processing_output_invalid");
}
