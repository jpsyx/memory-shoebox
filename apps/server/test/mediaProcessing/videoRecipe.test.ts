import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeVideoRenditionsFromSource } from "../../src/mediaProcessing/recipes/makeVideoRenditionsFromSource.ts";
import {
  createFixtureReader,
  createVerificationRunner,
  getFixturePath,
  getHashFromFile,
  getKeyframeTimesFromFile,
  getMetadataFromFile,
  getVideoProbe,
} from "./recipeTestHelpers.ts";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    disposers.splice(0).map((dispose) => {
      return dispose();
    }),
  );
});

async function _input(name: string, limit?: number) {
  const path = getFixturePath(name);
  const runner = await createVerificationRunner();
  const reader = await createFixtureReader(path, limit);
  disposers.push(runner.dispose, reader.close);
  return {
    sourcePathOrUrl: reader.url,
    sourceBytes: (await stat(path)).size,
    probe: await getVideoProbe(path),
    runner,
    scratchDirectory: runner.scratchPath,
    signal: new AbortController().signal,
  };
}

describe("actual video recipes (codec evidence, no isolation claim)", () => {
  it.each(["audio.mp4", "rotated.mp4", "vfr.mp4", "hevc.mp4"])(
    "makes a seekable compatible playback copy: %s",
    async (name) => {
      const path = getFixturePath(name);
      const before = await getHashFromFile(path);
      const input = await _input(name);
      const outputs = await makeVideoRenditionsFromSource(input);
      expect(
        outputs.map((output) => {
          return output.purpose;
        }),
      ).toEqual(["video_mp4", "poster", "thumb"]);
      const playback = outputs[0]!;
      const metadata = await getMetadataFromFile(playback.path);
      const video = metadata.streams.find((stream) => {
        return stream.codec_type === "video";
      })!;
      const audio = metadata.streams.find((stream) => {
        return stream.codec_type === "audio";
      });
      expect(video.codec_name).toBe("h264");
      expect(video.pix_fmt).toBe("yuv420p");
      expect(Math.max(video.width, video.height)).toBeLessThanOrEqual(1280);
      expect(Math.min(video.width, video.height)).toBeLessThanOrEqual(720);
      const [numerator, denominator] = video.avg_frame_rate
        .split("/")
        .map(Number);
      expect(numerator! / denominator!).toBeLessThanOrEqual(30);
      expect(Number(video.bit_rate)).toBeLessThanOrEqual(3_000_000);
      expect(
        Math.abs(
          Number(metadata.format.duration) - input.probe.durationMs! / 1000,
        ),
      ).toBeLessThanOrEqual(0.1);
      expect(Boolean(audio)).toBe(input.probe.hasAudio);
      if (audio) {
        expect(audio.codec_name).toBe("aac");
        expect(Number(audio.bit_rate)).toBeLessThanOrEqual(128_000);
        expect(
          Math.abs(Number(audio.start_time) - Number(video.start_time)),
        ).toBeLessThanOrEqual(0.05);
        expect(
          Math.abs(Number(audio.duration) - Number(video.duration)),
        ).toBeLessThanOrEqual(0.1);
      }
      if (name === "rotated.mp4") {
        expect([video.width, video.height]).toEqual([720, 1280]);
      }
      if (name === "audio.mp4") {
        expect(await getKeyframeTimesFromFile(playback.path)).toEqual([0, 2]);
      }
      const bytes = await readFile(playback.path);
      expect(bytes.indexOf("moov")).toBeLessThan(bytes.indexOf("mdat"));
      expect(await getHashFromFile(path)).toBe(before);
    },
    30000,
  );

  it("rejects a budget cutoff without accepting incomplete files", async () => {
    const input = await _input("audio.mp4", 128 * 1024);
    await expect(makeVideoRenditionsFromSource(input)).rejects.toThrow();
    expect(await readdir(join(input.runner.scratchPath, "output"))).toEqual([]);
  });

  it("rejects non-loopback sources before decode", async () => {
    const input = await _input("audio.mp4");
    await expect(
      makeVideoRenditionsFromSource({
        ...input,
        sourcePathOrUrl: "https://example.com/file.mp4",
      }),
    ).rejects.toThrow("processing_input_invalid");
  });
});

it("uses one video deadline and discards partial output on expiry", async () => {
  const input = await _input("audio.mp4");
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    return originalTimeout(10);
  });
  try {
    await expect(makeVideoRenditionsFromSource(input)).rejects.toThrow(
      "processing_video_timeout",
    );
    expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
  } finally {
    timeout.mockRestore();
  }
});

it("refuses a successful encode when final probing violates playback policy", async () => {
  const input = await _input("hevc.mp4");
  const run = input.runner.run;
  input.runner.run = async (command) => {
    const result = await run(command);
    if (command.executable !== "ffprobe") {
      return result;
    }
    const metadata = JSON.parse(result.stdout);
    metadata.streams[0].pix_fmt = "yuv420p10le";
    return { ...result, stdout: JSON.stringify(metadata) };
  };
  await expect(makeVideoRenditionsFromSource(input)).rejects.toThrow(
    "processing_output_invalid",
  );
  expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
});
