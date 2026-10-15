import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeVideoRenditionsFromSource } from "../../src/mediaProcessing/recipes/makeVideoRenditionsFromSource.ts";
import {
  createFixtureReader,
  createDockerVerificationRunner,
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

async function _input(name: string, limit?: number, shipping = false) {
  const path = getFixturePath(name);
  const runner =
    shipping && process.env.MEDIA_TEST_CODECS === "docker"
      ? await createDockerVerificationRunner(path)
      : await createVerificationRunner();
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

it.each([
  ["pix_fmt", "yuv420p10le"],
  ["sample_aspect_ratio", "2:1"],
  ["color_range", "pc"],
  ["height", 179],
])(
  "refuses a successful encode when final %s violates playback policy",
  async (field, value) => {
    const input = await _input("hevc.mp4");
    const run = input.runner.run;
    input.runner.run = async (command) => {
      const result = await run(command);
      if (command.executable !== "ffprobe") {
        return result;
      }
      const metadata = JSON.parse(result.stdout);
      metadata.streams[0][field] = value;
      return { ...result, stdout: JSON.stringify(metadata) };
    };
    await expect(makeVideoRenditionsFromSource(input)).rejects.toThrow(
      "processing_output_invalid",
    );
    expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
  },
);

it.each([
  { name: "sdr-601-anamorphic.mp4", dimensions: [720, 540], aspect: "4:3" },
  {
    name: "sdr-601-anamorphic-rotated.mp4",
    dimensions: [540, 720],
    aspect: "3:4",
  },
])(
  "preserves anamorphic display geometry after rotation: $name",
  async ({ name, dimensions, aspect }) => {
    const source = getFixturePath(name);
    const before = await getHashFromFile(source);
    const input = await _input(name, undefined, true);
    const outputs = await makeVideoRenditionsFromSource(input);
    const video = (await getMetadataFromFile(outputs[0]!.path)).streams[0]!;
    expect([video.width, video.height]).toEqual(dimensions);
    expect(video.sample_aspect_ratio).toBe("1:1");
    expect(video.display_aspect_ratio).toBe(aspect);
    expect([outputs[1]!.width, outputs[1]!.height]).toEqual(dimensions);
    const { data } = await sharp(outputs[1]!.path)
      .extract({ left: 20, top: 20, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const primary = name.includes("rotated") ? 1 : 0;
    expect(data[primary]).toBeGreaterThan(245);
    expect(data[1 - primary]).toBeLessThan(8);
    expect(await getHashFromFile(source)).toBe(before);
  },
);

it("converts encoded SMPTE170M matrix pixels before tagging BT.709", async () => {
  const input = await _input("sdr-601-anamorphic.mp4", undefined, true);
  const outputs = await makeVideoRenditionsFromSource(input);
  const video = (await getMetadataFromFile(outputs[0]!.path)).streams[0]!;
  expect([
    video.color_space,
    video.color_primaries,
    video.color_transfer,
    video.color_range,
  ]).toEqual(["bt709", "bt709", "bt709", "tv"]);
  const { data } = await sharp(outputs[1]!.path)
    .extract({ left: 20, top: 20, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[0]).toBeGreaterThan(245);
  expect(data[1]).toBeLessThan(8);
  expect(data[2]).toBeLessThan(8);
});

it.each(["untagged.mp4", "tiny-display-aspect.mp4"])(
  "rejects unsupported color or geometry without partial outputs: %s",
  async (name) => {
    const path = getFixturePath(name);
    const before = await getHashFromFile(path);
    const input = await _input(name, undefined, true);
    await expect(makeVideoRenditionsFromSource(input)).rejects.toThrow();
    expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
    expect(await getHashFromFile(path)).toBe(before);
  },
);
