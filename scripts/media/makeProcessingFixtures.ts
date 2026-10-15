import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../../apps/server/node_modules/sharp/dist/index.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT = join(ROOT, "apps/server/test/fixtures/media-processing");
const PREFIX = [
  "-v",
  "error",
  "-nostdin",
  "-y",
  "-threads",
  "1",
  "-filter_threads",
  "1",
];

/** Rebuilds small synthetic inputs; no family media or external downloads. */
async function _makeFixtures(): Promise<void> {
  mkdirSync(OUTPUT, { recursive: true });
  const stripes = Array.from({ length: 100 }, (_, index) => {
    return `<rect x="${index * 12}" y="1000" width="6" height="600" fill="white"/>`;
  }).join("");
  const chart = Buffer.from(
    `<svg width="2400" height="1600"><rect width="1200" height="800" fill="#e6141e"/><rect x="1200" width="1200" height="800" fill="#14d21e"/><rect y="800" width="1200" height="800" fill="#2040df"/><rect x="1200" y="800" width="1200" height="800" fill="#e0c020"/>${stripes}</svg>`,
  );
  await sharp(chart).png().toFile(join(OUTPUT, "detail.png"));
  await sharp(chart)
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 94 })
    .toFile(join(OUTPUT, "oriented.jpg"));
  await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toFile(join(OUTPUT, "transparent.png"));
  const noise = Buffer.alloc(400 * 400 * 3);
  let state = 1;
  noise.forEach((_, index) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    noise[index] = state >>> 24;
  });
  await sharp(noise, { raw: { width: 400, height: 400, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toFile(join(OUTPUT, "heavy.jpg"));
  copyFileSync(
    join(ROOT, "apps/server/src/mediaProcessing/runtime/fixtures/primary.heic"),
    join(OUTPUT, "primary.heic"),
  );
  _makeVideos();
}

function _ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", [...PREFIX, ...args], { stdio: "pipe" });
}

function _makeVideos(): void {
  const base = join(OUTPUT, "audio.mp4");
  _ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1440x810:rate=60",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "2.4",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-preset",
    "ultrafast",
    "-crf",
    "32",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    base,
  ]);
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${OUTPUT}:${OUTPUT}`,
      "memory-shoebox-media-tools",
      "ffmpeg",
      ...PREFIX,
      "-i",
      base,
      "-c",
      "copy",
      "-metadata:s:v:0",
      "rotate=90",
      join(OUTPUT, "rotated.mp4"),
    ],
    { stdio: "pipe" },
  );
  _ffmpeg([
    "-i",
    base,
    "-vf",
    "scale=320:180,select='if(lt(t,1),not(mod(n,2)),not(mod(n,4)))'",
    "-fps_mode",
    "vfr",
    "-an",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    join(OUTPUT, "vfr.mp4"),
  ]);
  _ffmpeg([
    "-i",
    base,
    "-vf",
    "scale=320:180,fps=24",
    "-an",
    "-c:v",
    "libx265",
    "-x265-params",
    "pools=none:frame-threads=1:log-level=error",
    "-tag:v",
    "hvc1",
    "-pix_fmt",
    "yuv420p10le",
    join(OUTPUT, "hevc.mp4"),
  ]);
  ["smpte2084", "arib-std-b67"].forEach((transfer) => {
    const target = join(
      OUTPUT,
      transfer === "smpte2084" ? "pq.mp4" : "hlg.mp4",
    );
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${OUTPUT}:${OUTPUT}`,
        "memory-shoebox-media-tools",
        "ffmpeg",
        ...PREFIX,
        "-loop",
        "1",
        "-i",
        join(OUTPUT, "detail.png"),
        "-t",
        "1",
        "-vf",
        `scale=320:212,zscale=pin=bt709:tin=iec61966-2-1:min=gbr:p=bt2020:t=${transfer}:m=bt2020nc,format=yuv420p10le`,
        "-c:v",
        "libx265",
        "-x265-params",
        "pools=none:frame-threads=1:log-level=error",
        "-tag:v",
        "hvc1",
        "-color_primaries",
        "bt2020",
        "-color_trc",
        transfer,
        "-colorspace",
        "bt2020nc",
        target,
      ],
      { stdio: "pipe" },
    );
  });
}

await _makeFixtures();
