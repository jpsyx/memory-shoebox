import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaProcessRunner } from "./createMediaProcessRunner.ts";

const FIXTURE = fileURLToPath(
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
];

const VIDEO_TEST_ARGUMENTS: string[] = [
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
];

/** Exercises codecs on known tiny inputs inside the same isolated job runner. */
export async function checkMediaCodecs(
  runner: Readonly<MediaProcessRunner>,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  const run = async (executable: string, args: string[]) => {
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
  await run("/bin/true", []);
  const primary = join(runner.scratchPath, "codec.heic");
  await copyFile(FIXTURE, primary);
  const png = join(runner.scratchPath, "codec.png");
  await run("heif-info", [primary]);
  await run("heif-thumbnailer", ["-p", "-s", "2048", primary, png]);
  await _checkPrimaryDimensions(run, png);
  await _checkColors(run, png);
  await _checkImage(run, {
    codec: "mjpeg",
    input: png,
    output: join(runner.scratchPath, "codec.jpg"),
  });
  await _checkImage(run, {
    codec: "libwebp",
    input: png,
    output: join(runner.scratchPath, "codec.webp"),
  });
  await _checkVideo(run, runner.scratchPath);
}

async function _checkVideo(
  run: (executable: string, args: string[]) => Promise<string>,
  scratchPath: string,
): Promise<void> {
  const video = join(scratchPath, "codec.mp4");
  await run("ffmpeg", [...FFMPEG_PREFIX, ...VIDEO_TEST_ARGUMENTS, video]);
  const codecs = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    video,
  ]);
  if (
    !codecs.split(/\s+/).includes("h264") ||
    !codecs.split(/\s+/).includes("aac")
  ) {
    throw new Error("processing_codecs_unavailable");
  }
  await run("ffmpeg", [
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
  ]);
}

async function _checkImage(
  run: (executable: string, args: string[]) => Promise<string>,
  options: Readonly<{ codec: string; input: string; output: string }>,
): Promise<void> {
  await run("ffmpeg", [
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
  ]);
  await _checkColors(run, options.output);
}

async function _checkColors(
  run: (executable: string, args: string[]) => Promise<string>,
  path: string,
): Promise<void> {
  const sample = async (vertical: number) => {
    const stats = await run("ffmpeg", [
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
    ]);
    return Number(/lavfi.signalstats.VAVG=([\d.]+)/.exec(stats)?.[1]);
  };
  const top = await sample(8);
  const bottom = await sample(40);
  if (!(top > 160 && bottom < 100)) {
    throw new Error("processing_codecs_unavailable");
  }
}

async function _checkPrimaryDimensions(
  run: (executable: string, args: string[]) => Promise<string>,
  png: string,
): Promise<void> {
  const dimensions = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    png,
  ]);
  if (dimensions.trim() !== "32,64") {
    throw new Error("processing_codecs_unavailable");
  }
}
