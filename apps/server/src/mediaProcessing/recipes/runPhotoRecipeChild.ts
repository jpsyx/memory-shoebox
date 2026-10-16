import {
  imageRecipeCandidateSchema,
  type ImageRecipeCandidate,
} from "./imageRecipeCandidateSchema.ts";
import { copyFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import sharp, { type Sharp } from "sharp";
import { z } from "zod";
import { APP_CONFIG } from "../../../../../app.config.ts";
import type { ProcessedRendition } from "./mediaRecipes.types.ts";

const OPTIONS = z.object({
  source: z.string(),
  outputDirectory: z.string(),
  measurementPath: z.string(),
  candidates: z.array(imageRecipeCandidateSchema).min(1).max(3),
});
const QUALITIES = [85, 75, 65, 55, 45] as const;
type ChildOptions = z.infer<typeof OPTIONS>;

type PhotoCandidateMeasurement = {
  purpose: ImageRecipeCandidate["purpose"];
  jpegBytes: number;
  webpBytes: number | null;
  jpegMs: number;
  elapsedMs: number;
  quality: number | null;
  targetBytes: number;
  targetMet: boolean;
  acceptedWebp: boolean;
};

function _getImage({
  source,
  longEdge,
}: {
  source: string;
  longEdge: number;
}): Sharp {
  return sharp(source, {
    limitInputPixels: APP_CONFIG.mediaProcessing.photoPixels,
    failOn: "error",
    pages: 1,
    sequentialRead: true,
  })
    .autoOrient()
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb");
}

async function _encodeJpeg({
  options,
  candidate,
  index = 0,
}: {
  options: Readonly<ChildOptions>;
  candidate: Readonly<ImageRecipeCandidate>;
  index?: number;
}): Promise<{ path: string; quality: number }> {
  const path = join(options.outputDirectory, `${candidate.purpose}.jpg`);
  const quality = QUALITIES[index]!;
  const result = await _getImage({
    source: options.source,
    longEdge: candidate.longEdge,
  })
    .jpeg({ quality, progressive: true, chromaSubsampling: "4:2:0" })
    .toFile(path);
  return result.size > candidate.bytes && index < QUALITIES.length - 1
    ? _encodeJpeg({ options, candidate, index: index + 1 })
    : { path, quality };
}

async function _makeJpeg({
  options,
  candidate,
}: {
  options: Readonly<ChildOptions>;
  candidate: Readonly<ImageRecipeCandidate>;
}): Promise<{ path: string; quality: number | undefined }> {
  const metadata = await sharp(options.source).metadata();
  const bytes = (await stat(options.source)).size;
  if (
    metadata.format === "jpeg" &&
    !metadata.icc &&
    (metadata.orientation === undefined || metadata.orientation === 1) &&
    Math.max(metadata.width, metadata.height) <= candidate.longEdge &&
    bytes <= candidate.bytes
  ) {
    const path = join(options.outputDirectory, `${candidate.purpose}.jpg`);
    await copyFile(options.source, path);
    return { path, quality: undefined };
  }
  return _encodeJpeg({ options, candidate });
}

async function _getRendition({
  path,
  purpose,
  format,
}: {
  path: string;
  purpose: ProcessedRendition["purpose"];
  format: "jpeg" | "webp";
}): Promise<ProcessedRendition> {
  const metadata = await sharp(path).metadata();
  if (
    metadata.format !== format ||
    (metadata.orientation !== undefined && metadata.orientation !== 1) ||
    (metadata.pages !== undefined && metadata.pages !== 1)
  ) {
    throw new Error("processing_output_invalid");
  }
  // Complete decoding catches corrupt output beyond a valid header.
  await sharp(path, { failOn: "error" }).stats();
  return {
    purpose,
    path,
    contentType: `image/${format}`,
    byteSize: (await stat(path)).size,
    width: metadata.width,
    height: metadata.height,
  };
}

async function _makeCandidate({
  options,
  candidate,
}: Readonly<{
  options: Readonly<ChildOptions>;
  candidate: Readonly<ImageRecipeCandidate>;
}>): Promise<{
  renditions: ProcessedRendition[];
  measurement: PhotoCandidateMeasurement;
}> {
  const started = performance.now();
  const encoded = await _makeJpeg({ options, candidate });
  const jpeg = await _getRendition({
    path: encoded.path,
    purpose: candidate.purpose,
    format: "jpeg",
  });
  const jpegMs = performance.now() - started;
  const webp =
    candidate.webpPurpose === undefined
      ? undefined
      : await _makeWebp(options, candidate);
  const accepted = webp !== undefined && webp.byteSize <= jpeg.byteSize * 0.85;
  if (webp !== undefined && !accepted) {
    await rm(webp.path);
  }
  return {
    renditions: accepted ? [jpeg, webp!] : [jpeg],
    measurement: {
      purpose: candidate.purpose,
      jpegBytes: jpeg.byteSize,
      webpBytes: webp?.byteSize ?? null,
      jpegMs,
      elapsedMs: performance.now() - started,
      quality: encoded.quality ?? null,
      targetBytes: candidate.bytes,
      targetMet: jpeg.byteSize <= candidate.bytes,
      acceptedWebp: accepted,
    },
  };
}

async function _makeWebp(
  options: Readonly<ChildOptions>,
  candidate: Readonly<ImageRecipeCandidate>,
): Promise<ProcessedRendition> {
  const path = join(options.outputDirectory, `${candidate.webpPurpose!}.webp`);
  await _getImage({ source: options.source, longEdge: candidate.longEdge })
    .webp({ quality: 82, effort: 4 })
    .toFile(path);
  return _getRendition({
    path,
    purpose: candidate.webpPurpose!,
    format: "webp",
  });
}

async function _run(): Promise<void> {
  sharp.concurrency(1);
  sharp.cache(false);
  const options = OPTIONS.parse(JSON.parse(process.argv[2] ?? ""));
  const metadata = await sharp(options.source, {
    limitInputPixels: APP_CONFIG.mediaProcessing.photoPixels,
  }).metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format) ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new Error("processing_photo_not_still");
  }
  const results: Array<Awaited<ReturnType<typeof _makeCandidate>>> = [];
  await options.candidates.reduce(async (previous, candidate) => {
    await previous;
    results.push(
      await _makeCandidate({ options: options, candidate: candidate }),
    );
  }, Promise.resolve());
  await writeFile(
    options.measurementPath,
    JSON.stringify(
      results.map((result) => {
        return result.measurement;
      }),
    ),
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify(
      results.flatMap((result) => {
        return result.renditions;
      }),
    ),
  );
}

await _run().catch(() => {
  process.stderr.write("processing_photo_recipe_failed\n");
  process.exitCode = 1;
});
