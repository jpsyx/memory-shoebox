import { mkdtemp, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { APP_CONFIG } from "../../../../../app.config.ts";
import { makeMediaArgumentsFromInput } from "../runtime/probeMedia/probeMediaHelpers.ts";
import { makeVideoArgumentsFromProbe } from "./makeVideoArgumentsFromProbe.ts";
import {
  checkMediaRecipeInput,
  getMediaRecipeErrorFromFailure,
  getByteSizeFromOwnedFile,
  makeImageRenditionsFromFile,
} from "./mediaRecipeFileHelpers.ts";
import type {
  MediaRecipeInput,
  ProcessedRendition,
} from "./mediaRecipes.types.ts";

const TIMING = {
  duration: z.coerce.number().positive(),
  start_time: z.coerce.number(),
} satisfies z.ZodRawShape;
const VIDEO = z.object({
  ...TIMING,
  codec_type: z.literal("video"),
  codec_name: z.literal("h264"),
  profile: z.literal("Main"),
  level: z.literal(31),
  width: z.number().int().positive().max(1280).multipleOf(2),
  height: z.number().int().positive().max(1280).multipleOf(2),
  pix_fmt: z.literal("yuv420p"),
  avg_frame_rate: z.string(),
  bit_rate: z.coerce.number().positive().max(3_000_000),
  color_transfer: z.literal("bt709"),
  color_primaries: z.literal("bt709"),
  color_space: z.literal("bt709"),
  color_range: z.literal("tv"),
  sample_aspect_ratio: z.literal("1:1"),
  side_data_list: z
    .array(z.object({ rotation: z.number().optional() }))
    .optional(),
});
const AUDIO = z.object({
  ...TIMING,
  codec_type: z.literal("audio"),
  codec_name: z.literal("aac"),
  bit_rate: z.coerce.number().positive().max(128_000),
});
const METADATA = z.object({
  streams: z
    .array(z.discriminatedUnion("codec_type", [VIDEO, AUDIO]))
    .min(1)
    .max(2),
  format: z.object({ duration: z.coerce.number().positive() }),
});
const FFMPEG_PREFIX = [
  "-v",
  "error",
  "-xerror",
  "-nostdin",
  "-filter_threads",
  "1",
  "-filter_complex_threads",
  "1",
] as const;

async function _run({
  input,
  executable,
  args,
}: {
  input: Readonly<MediaRecipeInput>;
  executable: string;
  args: string[];
}): Promise<string> {
  const result = await input.runner.run({
    executable,
    args,
    signal: input.signal,
    timeoutMs: APP_CONFIG.mediaProcessing.videoTimeoutMs,
    stdoutLimitBytes: APP_CONFIG.mediaProcessing.probeMetadataBytes,
  });
  if (result.exitCode !== 0) {
    throw new Error("processing_video_recipe_failed");
  }
  return result.stdout;
}

function _hasBoundedDimensions({
  video,
  input,
}: {
  video: Readonly<{ width: number; height: number }>;
  input: Readonly<MediaRecipeInput>;
}): boolean {
  const { width, height, rotationDegrees } = input.probe;
  const rotated = [90, 270].includes(rotationDegrees);
  return (
    Math.min(video.width, video.height) <= 720 &&
    video.width <= (rotated ? height : width) &&
    video.height <= (rotated ? width : height)
  );
}

function _checkStreams({
  metadata,
  input,
}: {
  metadata: Readonly<z.infer<typeof METADATA>>;
  input: Readonly<MediaRecipeInput>;
}): { width: number; height: number } {
  const videos = metadata.streams.filter((stream) => {
    return stream.codec_type === "video";
  });
  const video = videos[0];
  const audio = metadata.streams.find((stream) => {
    return stream.codec_type === "audio";
  });
  const [numerator, denominator] = (video?.avg_frame_rate ?? "")
    .split("/")
    .map(Number);
  const rate = numerator! / denominator!;
  const tolerance = 1 / Math.min(input.probe.frameRate!, 30) + 1024 / 48000;
  if (
    !video ||
    videos.length !== 1 ||
    !_hasBoundedDimensions({ video, input }) ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > 30 ||
    video.side_data_list?.some((data) => {
      return (data.rotation ?? 0) !== 0;
    }) ||
    Math.abs(metadata.format.duration - input.probe.durationMs! / 1000) >
      tolerance ||
    Boolean(audio) !== input.probe.hasAudio
  ) {
    throw new Error("processing_output_invalid");
  }
  return { width: video.width, height: video.height };
}

async function _checkFaststart(path: string): Promise<void> {
  const file = await open(path, "r");
  const size = (await file.stat()).size;
  const scan = async ({
    offset,
    remaining,
  }: {
    offset: number;
    remaining: number;
  }): Promise<void> => {
    if (remaining === 0 || offset + 8 > size) {
      throw new Error("processing_output_invalid");
    }
    const header = Buffer.alloc(16);
    await file.read(header, 0, 16, offset);
    const type = header.toString("ascii", 4, 8);
    const bytes =
      header.readUInt32BE(0) === 1
        ? Number(header.readBigUInt64BE(8))
        : header.readUInt32BE(0);
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 8 ||
      offset + bytes > size ||
      type === "mdat"
    ) {
      throw new Error("processing_output_invalid");
    }
    if (type !== "moov") {
      await scan({ offset: offset + bytes, remaining: remaining - 1 });
    }
  };
  try {
    await scan({ offset: 0, remaining: 64 });
  } finally {
    await file.close();
  }
}

async function _validatePlayback({
  input,
  path,
}: {
  input: Readonly<MediaRecipeInput>;
  path: string;
}): Promise<{ width: number; height: number }> {
  const stdout = await _run({
    input,
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      ...makeMediaArgumentsFromInput({ format: "mov", input: path }),
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path,
    ],
  });
  const dimensions = _checkStreams({
    metadata: METADATA.parse(JSON.parse(stdout)),
    input,
  });
  await _checkFaststart(path);
  // A complete local decode rejects damaged packets after a valid moov header.
  await _run({
    input,
    executable: "ffmpeg",
    args: [
      ...FFMPEG_PREFIX,
      ...makeMediaArgumentsFromInput({ format: "mov", input: path }),
      "-i",
      path,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-threads",
      "1",
      "-f",
      "null",
      "-",
    ],
  });
  return dimensions;
}

async function _getPlayback({
  input,
  outputDirectory,
}: {
  input: Readonly<MediaRecipeInput>;
  outputDirectory: string;
}): Promise<ProcessedRendition> {
  const path = join(outputDirectory, "playback.mp4");
  await _run({
    input,
    executable: "ffmpeg",
    args: makeVideoArgumentsFromProbe({
      probe: input.probe,
      inputUrl: input.sourcePathOrUrl,
      outputPath: path,
    }),
  });
  const dimensions = await _validatePlayback({ input, path });
  const byteSize = await getByteSizeFromOwnedFile({
    path,
    directory: outputDirectory,
  });
  return {
    purpose: "video_mp4",
    path,
    contentType: "video/mp4",
    byteSize,
    ...dimensions,
  };
}

async function _getPosters({
  input,
  playback,
  outputDirectory,
}: {
  input: Readonly<MediaRecipeInput>;
  playback: Readonly<ProcessedRendition>;
  outputDirectory: string;
}): Promise<ProcessedRendition[]> {
  const source = join(input.scratchDirectory, "poster-source.png");
  await _run({
    input,
    executable: "ffmpeg",
    args: [
      ...FFMPEG_PREFIX,
      "-n",
      ...makeMediaArgumentsFromInput({ format: "mov", input: playback.path }),
      "-i",
      playback.path,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-threads",
      "1",
      source,
    ],
  });
  return makeImageRenditionsFromFile({
    input,
    source,
    outputDirectory,
    candidates: [
      { purpose: "poster", longEdge: 2048, bytes: 1.5 * 1024 ** 2 },
      { purpose: "thumb", longEdge: 480, bytes: 128 * 1024 },
    ],
  });
}

/**
 * Produces a validated local playback MP4, poster and thumbnail, never
 * publishes.
 */
export async function makeVideoRenditionsFromSource(
  input: Readonly<MediaRecipeInput>,
): Promise<ProcessedRendition[]> {
  const deadline = AbortSignal.timeout(
    APP_CONFIG.mediaProcessing.videoTimeoutMs,
  );
  const boundedInput = {
    ...input,
    signal: AbortSignal.any([input.signal, deadline]),
  };
  await checkMediaRecipeInput({ input: boundedInput, kind: "video" });
  makeMediaArgumentsFromInput({ format: "mov", input: input.sourcePathOrUrl });
  if (!input.sourcePathOrUrl.startsWith("http://127.0.0.1:")) {
    throw new Error("processing_input_invalid");
  }
  const outputDirectory = await mkdtemp(
    join(input.scratchDirectory, "output/video-"),
  );
  try {
    const playback = await _getPlayback({
      input: boundedInput,
      outputDirectory,
    });
    const posters = await _getPosters({
      input: boundedInput,
      playback,
      outputDirectory,
    });
    const outputs = [playback, ...posters];
    if (
      outputs.reduce((sum, output) => {
        return sum + output.byteSize;
      }, 0) > APP_CONFIG.mediaProcessing.outputBytes
    ) {
      throw new Error("processing_disk_limit");
    }
    boundedInput.signal.throwIfAborted();
    return outputs;
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    if (input.signal.aborted) {
      throw new Error("processing_cancelled");
    }
    if (deadline.aborted) {
      throw new Error("processing_video_timeout");
    }
    throw getMediaRecipeErrorFromFailure(error);
  }
}
