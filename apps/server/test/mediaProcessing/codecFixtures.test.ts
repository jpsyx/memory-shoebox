import { copyFile, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import { makePhotoRenditionsFromSource } from "../../src/mediaProcessing/recipes/makePhotoRenditionsFromSource.ts";
import { makeVideoRenditionsFromSource } from "../../src/mediaProcessing/recipes/makeVideoRenditionsFromSource.ts";
import {
  createDockerVerificationRunner,
  createVerificationRunner,
  getFixturePath,
  getMetadataFromFile,
  getVideoProbe,
} from "./recipeTestHelpers.ts";

it("retains JPEG fallback and only accepts economical WebP with intact color/detail", async () => {
  const runner = await createVerificationRunner();
  try {
    const source = join(runner.scratchPath, "source.png");
    await copyFile(getFixturePath("detail.png"), source);
    const outputs = await makePhotoRenditionsFromSource({
      sourcePathOrUrl: source,
      sourceBytes: (await stat(source)).size,
      probe: {
        kind: "photo",
        width: 2400,
        height: 1600,
        frameRate: null,
        bitDepth: 8,
        durationMs: null,
        hasAudio: false,
        transfer: "sdr",
        rotationDegrees: 0,
        primaryImageCount: 1,
      },
      runner,
      scratchDirectory: runner.scratchPath,
      signal: new AbortController().signal,
    });
    const webp = outputs.find((output) => {
      return output.purpose === "display_webp";
    })!;
    const jpeg = outputs.find((output) => {
      return output.purpose === "display";
    })!;
    expect(webp).toBeDefined();
    expect(webp.byteSize).toBeLessThanOrEqual(jpeg.byteSize * 0.85);
    expect([webp.width, webp.height]).toEqual([jpeg.width, jpeg.height]);
    const { data, info } = await sharp(webp.path)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      return [
        ...data.subarray(
          (y * info.width + x) * 3,
          (y * info.width + x) * 3 + 3,
        ),
      ];
    };
    expect(pixel(100, 100)[0]).toBeGreaterThan(200);
    expect(pixel(1500, 100)[1]).toBeGreaterThan(185);
    expect(pixel(2, 1100)[0]).toBeGreaterThan(200);
    expect(pixel(7, 1100)[0]).toBeLessThan(80);
    const measurements = JSON.parse(
      await readFile(
        join(runner.scratchPath, "photo-measurements.json"),
        "utf8",
      ),
    ) as Array<{ elapsedMs: number; jpegBytes: number; webpBytes: number }>;
    expect(measurements).toHaveLength(3);
    expect(
      measurements.every((row) => {
        return row.elapsedMs >= 0 && row.jpegBytes > 0;
      }),
    ).toBe(true);
  } finally {
    await runner.dispose();
  }
}, 20000);

it
  .runIf(process.env.MEDIA_TEST_CODECS === "docker")
  .each(["pq.mp4", "hlg.mp4"])(
  "tone maps actual %s to decoded SDR with intact color",
  async (name) => {
    const path = getFixturePath(name);
    const runner = await createDockerVerificationRunner(path);
    try {
      const outputs = await makeVideoRenditionsFromSource({
        sourcePathOrUrl: "http://127.0.0.1:39717/source",
        sourceBytes: (await stat(path)).size,
        probe: await getVideoProbe(path),
        runner,
        scratchDirectory: runner.scratchPath,
        signal: new AbortController().signal,
      });
      const metadata = await getMetadataFromFile(outputs[0]!.path);
      const video = metadata.streams[0]!;
      expect(video.color_transfer).toBe("bt709");
      expect(video.pix_fmt).toBe("yuv420p");
      expect([video.width, video.height]).toEqual([320, 212]);
      const { data, info } = await sharp(outputs[1]!.path)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const red = [
        ...data.subarray(
          3 * (20 * info.width + 20),
          3 * (20 * info.width + 20) + 3,
        ),
      ];
      const green = [
        ...data.subarray(
          3 * (20 * info.width + 240),
          3 * (20 * info.width + 240) + 3,
        ),
      ];
      expect(red[0]).toBeGreaterThan(red[1]! + 60);
      expect(red[0]).toBeGreaterThan(130);
      expect(red[0]).toBeLessThan(160);
      expect(green[1]).toBeGreaterThan(125);
      expect(green[1]).toBeLessThan(150);
      expect(green[1]).toBeGreaterThan(green[0]! + 60);
      expect(Number(metadata.format.duration)).toBeCloseTo(1, 1);
    } finally {
      await runner.dispose();
    }
  },
  30000,
);

it.runIf(process.env.MEDIA_TEST_CODECS === "docker")(
  "rejects HDR with unknown colorimetry instead of accepting an invented conversion",
  async () => {
    const path = getFixturePath("hevc.mp4");
    const runner = await createDockerVerificationRunner(path);
    try {
      await expect(
        makeVideoRenditionsFromSource({
          sourcePathOrUrl: "http://127.0.0.1:39717/source",
          sourceBytes: (await stat(path)).size,
          probe: { ...(await getVideoProbe(path)), transfer: "pq" },
          runner,
          scratchDirectory: runner.scratchPath,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow();
      expect(await readdir(join(runner.scratchPath, "output"))).toEqual([]);
    } finally {
      await runner.dispose();
    }
  },
  30000,
);
