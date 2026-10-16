import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath as fileUrlToPath } from "node:url";
import type { MediaProcessRunner } from "./createMediaProcessRunner.ts";

const FIXTURE = fileUrlToPath(
  new URL("./fixtures/primary.heic", import.meta.url),
);
const FFMPEG_PREFIX = [
  "-v",
  "error",
  "-nostdin",
  "-y",
  "-threads",
  "1",
  "-filter_threads",
  "1",
  "-filter_complex_threads",
  "1",
] as const;

const VIDEO_TEST_ARGUMENTS = [
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=32x32:rate=10",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000",
  "-t",
  "0.2",
  "-c:v",
  "libx264",
  "-threads",
  "1",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-movflags",
  "+faststart",
] as const;

async function _checkVideo({
  run,
  scratchPath,
}: {
  run: (
    options: Readonly<{ executable: string; args: string[] }>,
  ) => Promise<string>;
  scratchPath: string;
}): Promise<void> {
  const video = join(scratchPath, "codec.mp4");
  await run({
    executable: "ffmpeg",
    args: [...FFMPEG_PREFIX, ...VIDEO_TEST_ARGUMENTS, video],
  });
  const codecs = await run({
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name",
      "-of",
      "csv=p=0",
      video,
    ],
  });
  if (
    !codecs.split(/\s+/).includes("h264") ||
    !codecs.split(/\s+/).includes("aac")
  ) {
    throw new Error("processing_codecs_unavailable");
  }
  await run({
    executable: "ffmpeg",
    args: [
      ...FFMPEG_PREFIX,
      "-i",
      video,
      "-vf",
      "zscale=pin=bt2020:tin=smpte2084:min=bt2020nc:p=bt2020:t=linear:m=gbr:npl=100,format=gbrpf32le,tonemap=tonemap=hable,zscale=p=bt709:t=bt709:m=bt709,format=yuv420p",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
  });
}

async function _checkImage({
  run,
  options,
}: {
  run: (
    options: Readonly<{ executable: string; args: string[] }>,
  ) => Promise<string>;
  options: Readonly<{ codec: string; input: string; output: string }>;
}): Promise<void> {
  await run({
    executable: "ffmpeg",
    args: [
      ...FFMPEG_PREFIX,
      "-i",
      options.input,
      "-frames:v",
      "1",
      "-c:v",
      options.codec,
      "-threads",
      "1",
      options.output,
    ],
  });
  await _checkColors({ run, path: options.output });
}

async function _checkColors({
  run,
  path,
}: {
  run: (
    options: Readonly<{ executable: string; args: string[] }>,
  ) => Promise<string>;
  path: string;
}): Promise<void> {
  const sample = async (vertical: number) => {
    const stats = await run({
      executable: "ffmpeg",
      args: [
        ...FFMPEG_PREFIX,
        "-i",
        path,
        "-vf",
        `crop=16:16:8:${vertical},signalstats,metadata=print:file=-`,
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
    });
    return Number(/lavfi.signalstats.VAVG=([\d.]+)/.exec(stats)?.[1]);
  };
  const top = await sample(8);
  const bottom = await sample(40);
  if (!(top > 160 && bottom < 100)) {
    throw new Error("processing_codecs_unavailable");
  }
}

async function _checkPrimaryDimensions({
  run,
  png,
}: {
  run: (
    options: Readonly<{ executable: string; args: string[] }>,
  ) => Promise<string>;
  png: string;
}): Promise<void> {
  const dimensions = await run({
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      png,
    ],
  });
  if (dimensions.trim() !== "32,64") {
    throw new Error("processing_codecs_unavailable");
  }
}

/**
 * Exercises codecs on known tiny inputs inside the same isolated job runner.
 */
export async function checkMediaCodecs({
  runner,
  signal = new AbortController().signal,
}: Readonly<{
  runner: Readonly<MediaProcessRunner>;
  signal?: AbortSignal;
}>): Promise<void> {
  const run = async ({
    executable,
    args,
  }: Readonly<{ executable: string; args: string[] }>) => {
    const result = await runner.run({
      executable,
      args,
      signal,
      timeoutMs: 15_000,
      stdoutLimitBytes: 1024 ** 2,
    });
    if (result.exitCode !== 0) {
      throw new Error("processing_codecs_unavailable");
    }
    return result.stdout;
  };
  await run({ executable: "/bin/true", args: [] });
  const primary = join(runner.scratchPath, "codec.heic");
  await copyFile(FIXTURE, primary);
  const png = join(runner.scratchPath, "codec.png");
  await run({ executable: "heif-info", args: [primary] });
  await run({
    executable: "heif-thumbnailer",
    args: ["-p", "-s", "2048", primary, png],
  });
  await _checkPrimaryDimensions({ run, png });
  await _checkColors({ run, path: png });
  await _checkImage({
    run,
    options: {
      codec: "mjpeg",
      input: png,
      output: join(runner.scratchPath, "codec.jpg"),
    },
  });
  await _checkImage({
    run,
    options: {
      codec: "libwebp",
      input: png,
      output: join(runner.scratchPath, "codec.webp"),
    },
  });
  await _checkVideo({ run, scratchPath: runner.scratchPath });
}
