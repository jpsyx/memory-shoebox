import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARTOON_SCENES,
  getShapesFromScene,
  type SceneName,
} from "./cartoonScene";
import { makeSvgFromShapes } from "./cartoonSvg";

/**
 * Writes the committed cartoon media set.
 *
 * **Both this script and its output are committed.** The script makes the set
 * reproducible and adjustable; the output makes a fresh clone render without
 * `rsvg-convert`, `magick` or `ffmpeg` installed. It is deterministic: run it
 * twice and the bytes match.
 *
 * Usage: `pnpm --filter @memory-shoebox/prototypes media`
 */

const OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../public/media/web/", import.meta.url),
);

/** A temporary place for the SVG each raster is made from. */
const WORK_DIRECTORY = fileURLToPath(
  new URL("../../.cartoon-work/", import.meta.url),
);

/** The eight stills, and the shape of the frame each is drawn into. */
const STILLS: ReadonlyArray<{
  scene: SceneName;
  orientation: "landscape" | "portrait";
}> = [
  { scene: "arrival", orientation: "landscape" },
  { scene: "cot", orientation: "landscape" },
  { scene: "bath", orientation: "portrait" },
  { scene: "highChair", orientation: "landscape" },
  { scene: "pram", orientation: "portrait" },
  { scene: "firstSteps", orientation: "portrait" },
  { scene: "cake", orientation: "landscape" },
  { scene: "beach", orientation: "landscape" },
];

/** Display pixels for each orientation, and the thumbnail's long edge. */
const SIZES = {
  landscape: { width: 1600, height: 1067 },
  portrait: { width: 1067, height: 1600 },
  thumbLongEdge: 400,
} as const;

/**
 * The run the stack exists for: one candle, forty-five near-identical
 * frames.
 */
const BURST = { scene: "cake", frameCount: 45 } as const;

/** Three ten-second animations, which is what a video in the pile is. */
const CLIPS: ReadonlyArray<{ scene: SceneName; name: string }> = [
  { scene: "firstSteps", name: "first-steps" },
  { scene: "bath", name: "splashing" },
  { scene: "pram", name: "the-walk" },
];

/** Frames a second, and how many seconds. Cartoon motion reads fine at 12. */
const CLIP = { fps: 12, seconds: 10 } as const;

/** Rasterises one scene at one size, writing a JPEG. */
function _writeJpeg(options: {
  scene: SceneName;
  phase: number;
  width: number;
  height: number;
  outputPath: string;
}): void {
  const svgPath = join(WORK_DIRECTORY, "frame.svg");
  const pngPath = join(WORK_DIRECTORY, "frame.png");
  writeFileSync(
    svgPath,
    makeSvgFromShapes({
      shapes: getShapesFromScene({
        scene: options.scene,
        phase: options.phase,
      }),
      width: options.width,
      height: options.height,
    }),
  );
  execFileSync("rsvg-convert", ["-o", pngPath, svgPath]);
  // Flat cartoon colour at quality 82 is a few tens of kilobytes; `-strip`
  // drops the metadata that would otherwise make two identical runs differ.
  execFileSync("magick", [
    pngPath,
    "-strip",
    "-quality",
    "82",
    options.outputPath,
  ]);
}

/**
 * Writes the forty-five frame burst, the run of near-identical frames the
 * timeline's stack exists to collapse.
 */
function _writeBurst(): void {
  for (let index = 0; index < BURST.frameCount; index += 1) {
    // A tenth of one swing across the whole run, so consecutive frames differ
    // by almost nothing and the run as a whole visibly moves.
    const phase = (index / BURST.frameCount) * 0.1;
    const number = String(index + 1).padStart(3, "0");
    _writeJpeg({
      scene: BURST.scene,
      phase,
      width: SIZES.landscape.width,
      height: SIZES.landscape.height,
      outputPath: join(OUTPUT_DIRECTORY, `burst_${number}.jpg`),
    });
    _writeJpeg({
      scene: BURST.scene,
      phase,
      width: SIZES.thumbLongEdge,
      height: Math.round((SIZES.thumbLongEdge * 2) / 3),
      outputPath: join(OUTPUT_DIRECTORY, `burst_${number}-thumb.jpg`),
    });
  }
  process.stdout.write(`${BURST.frameCount} burst frames written\n`);
}

/** Renders one clip's sequential JPEG frames into their own directory. */
function _writeClipFrames(options: { scene: SceneName; name: string }): string {
  const frameDirectory = join(WORK_DIRECTORY, options.name);
  mkdirSync(frameDirectory, { recursive: true });
  const frameCount = CLIP.fps * CLIP.seconds;
  for (let index = 0; index < frameCount; index += 1) {
    _writeJpeg({
      scene: options.scene,
      // A whole loop across the clip, so it can repeat without a jump.
      phase: index / frameCount,
      width: 960,
      height: 640,
      outputPath: join(
        frameDirectory,
        `${String(index + 1).padStart(4, "0")}.jpg`,
      ),
    });
  }
  return frameDirectory;
}

/**
 * What makes a container's bytes the same on every run.
 *
 * Without it the WebM muxer writes a random `SegmentUID` and both muxers
 * stamp the encoder's own version string, so three files changed on every
 * re-run and a regenerate was never an empty diff. Bit-exact mode drops both,
 * which is the whole reason the committed output can be checked against a
 * fresh render.
 */
const BITEXACT = ["-fflags", "+bitexact", "-flags:v", "+bitexact"];

/** Encodes one clip's frame sequence into an h264 mp4 and a vp9 webm. */
function _encodeClip(options: { frameDirectory: string; name: string }): void {
  const pattern = join(options.frameDirectory, "%04d.jpg");
  const fps = String(CLIP.fps);
  execFileSync("ffmpeg", [
    "-y",
    "-framerate",
    fps,
    "-i",
    pattern,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "28",
    ...BITEXACT,
    join(OUTPUT_DIRECTORY, `${options.name}.mp4`),
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-framerate",
    fps,
    "-i",
    pattern,
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "38",
    ...BITEXACT,
    join(OUTPUT_DIRECTORY, `${options.name}.webm`),
  ]);
}

/** Renders one clip's frames and encodes them twice, plus a poster. */
function _writeClip(options: { scene: SceneName; name: string }): void {
  const frameDirectory = _writeClipFrames(options);
  _encodeClip({ frameDirectory, name: options.name });
  _writeJpeg({
    scene: options.scene,
    phase: 0,
    width: 960,
    height: 640,
    outputPath: join(OUTPUT_DIRECTORY, `${options.name}-poster.jpg`),
  });
  _writeJpeg({
    scene: options.scene,
    phase: 0,
    width: SIZES.thumbLongEdge,
    height: Math.round((SIZES.thumbLongEdge * 2) / 3),
    outputPath: join(OUTPUT_DIRECTORY, `${options.name}-thumb.jpg`),
  });
}

function _main(): void {
  rmSync(WORK_DIRECTORY, { recursive: true, force: true });
  mkdirSync(WORK_DIRECTORY, { recursive: true });
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  for (const { scene, orientation } of STILLS) {
    const { width, height } = SIZES[orientation];
    _writeJpeg({
      scene,
      phase: 0,
      width,
      height,
      outputPath: join(OUTPUT_DIRECTORY, `${scene}.jpg`),
    });
    const isLandscape = orientation === "landscape";
    _writeJpeg({
      scene,
      phase: 0,
      width: isLandscape
        ? SIZES.thumbLongEdge
        : Math.round((SIZES.thumbLongEdge * 2) / 3),
      height: isLandscape
        ? Math.round((SIZES.thumbLongEdge * 2) / 3)
        : SIZES.thumbLongEdge,
      outputPath: join(OUTPUT_DIRECTORY, `${scene}-thumb.jpg`),
    });
    process.stdout.write(`${scene}\n`);
  }

  _writeBurst();

  for (const clip of CLIPS) {
    _writeClip(clip);
    process.stdout.write(`${clip.name}\n`);
  }

  rmSync(WORK_DIRECTORY, { recursive: true, force: true });
  process.stdout.write(`${CARTOON_SCENES.length} scenes written\n`);
}

_main();
