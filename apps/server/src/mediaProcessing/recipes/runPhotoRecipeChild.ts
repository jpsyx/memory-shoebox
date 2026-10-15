import { copyFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import sharp, { type Sharp } from "sharp";
import { z } from "zod";
import { appConfig } from "../../../../../app.config.ts";
import type { ProcessedRendition } from "./mediaRecipes.types.ts";

const CANDIDATE = z.object({
  purpose: z.enum(["thumb", "poster", "display_small", "display"]),
  longEdge: z.number().int().positive().max(2048),
  bytes: z
    .number()
    .positive()
    .max(1.5 * 1024 ** 2),
  webpPurpose: z.enum(["display_small_webp", "display_webp"]).optional(),
});
const OPTIONS = z.object({
  source: z.string(),
  outputDirectory: z.string(),
  measurementPath: z.string(),
  candidates: z.array(CANDIDATE).min(1).max(3),
});
const QUALITIES = [85, 75, 65, 55, 45] as const;
type ChildOptions = z.infer<typeof OPTIONS>;
type Candidate = z.infer<typeof CANDIDATE>;

function _getImage(source: string, longEdge: number): Sharp {
  return sharp(source, {
    limitInputPixels: appConfig.mediaProcessing.photoPixels,
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

async function _encodeJpeg(
  options: Readonly<ChildOptions>,
  candidate: Readonly<Candidate>,
  index = 0,
): Promise<{ path: string; quality: number | null }> {
  const path = join(options.outputDirectory, `${candidate.purpose}.jpg`);
  const quality = QUALITIES[index]!;
  const result = await _getImage(options.source, candidate.longEdge)
    .jpeg({ quality, progressive: true, chromaSubsampling: "4:2:0" })
    .toFile(path);
  return result.size > candidate.bytes && index < QUALITIES.length - 1
    ? _encodeJpeg(options, candidate, index + 1)
    : { path, quality };
}

async function _makeJpeg(
  options: Readonly<ChildOptions>,
  candidate: Readonly<Candidate>,
): Promise<{ path: string; quality: number | null }> {
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
    return { path, quality: null };
  }
  return _encodeJpeg(options, candidate);
}

async function _getRendition(
  path: string,
  purpose: ProcessedRendition["purpose"],
  format: "jpeg" | "webp",
): Promise<ProcessedRendition> {
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

async function _makeCandidate(
  options: Readonly<ChildOptions>,
  candidate: Readonly<Candidate>,
) {
  const started = performance.now();
  const encoded = await _makeJpeg(options, candidate);
  const jpeg = await _getRendition(encoded.path, candidate.purpose, "jpeg");
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
      quality: encoded.quality,
      targetBytes: candidate.bytes,
      targetMet: jpeg.byteSize <= candidate.bytes,
      acceptedWebp: accepted,
    },
  };
}

async function _makeWebp(
  options: Readonly<ChildOptions>,
  candidate: Readonly<Candidate>,
): Promise<ProcessedRendition> {
  const path = join(options.outputDirectory, `${candidate.webpPurpose!}.webp`);
  await _getImage(options.source, candidate.longEdge)
    .webp({ quality: 82, effort: 4 })
    .toFile(path);
  return _getRendition(path, candidate.webpPurpose!, "webp");
}

async function _run(): Promise<void> {
  sharp.concurrency(1);
  sharp.cache(false);
  const options = OPTIONS.parse(JSON.parse(process.argv[2] ?? ""));
  const metadata = await sharp(options.source, {
    limitInputPixels: appConfig.mediaProcessing.photoPixels,
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
    results.push(await _makeCandidate(options, candidate));
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
