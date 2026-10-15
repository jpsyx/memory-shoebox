import {
  copyFile,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePhotoRenditionsFromSource } from "../../src/mediaProcessing/recipes/makePhotoRenditionsFromSource.ts";
import { makeImageRenditionsFromFile } from "../../src/mediaProcessing/recipes/mediaRecipeFiles.ts";
import type { MediaProbe } from "../../src/mediaProcessing/runtime/mediaRuntime.types.ts";
import {
  createVerificationRunner,
  getFixturePath,
  getHashFromFile,
} from "./recipeTestHelpers.ts";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    disposers.splice(0).map((dispose) => {
      return dispose();
    }),
  );
});

async function _input(name: string, width: number, height: number) {
  const runner = await createVerificationRunner();
  disposers.push(runner.dispose);
  const sourcePathOrUrl = join(runner.scratchPath, "source");
  await copyFile(getFixturePath(name), sourcePathOrUrl);
  const probe: MediaProbe = {
    kind: "photo",
    width,
    height,
    bitDepth: 8,
    frameRate: null,
    durationMs: null,
    hasAudio: false,
    transfer: "sdr",
    rotationDegrees: 0,
    primaryImageCount: 1,
  };
  return {
    sourcePathOrUrl,
    sourceBytes: (await stat(sourcePathOrUrl)).size,
    probe,
    runner,
    scratchDirectory: runner.scratchPath,
    signal: new AbortController().signal,
  };
}

describe("actual photo recipes (codec evidence, no isolation claim)", () => {
  it("makes oriented 480/960/2048 candidates without upscaling", async () => {
    const input = await _input("oriented.jpg", 2400, 1600);
    const originalHashBefore = await getHashFromFile(input.sourcePathOrUrl);
    const outputs = await makePhotoRenditionsFromSource(input);
    expect(
      outputs
        .filter((output) => {
          return output.contentType === "image/jpeg";
        })
        .map(({ purpose, width, height }) => {
          return [purpose, width, height];
        }),
    ).toEqual([
      ["thumb", 320, 480],
      ["display_small", 640, 960],
      ["display", 1365, 2048],
    ]);
    await Promise.all(
      outputs.map(async (output) => {
        const metadata = await sharp(output.path).metadata();
        expect([metadata.width, metadata.height]).toEqual([
          output.width,
          output.height,
        ]);
        expect(metadata.format).toBe(
          output.contentType === "image/jpeg" ? "jpeg" : "webp",
        );
        expect((await stat(output.path)).size).toBe(output.byteSize);
      }),
    );
    expect(await getHashFromFile(input.sourcePathOrUrl)).toBe(
      originalHashBefore,
    );
  }, 20000);

  it("re-encodes small-but-heavy JPEGs against byte targets", async () => {
    const input = await _input("heavy.jpg", 400, 400);
    expect(input.sourceBytes).toBeGreaterThan(128 * 1024);
    const outputs = await makePhotoRenditionsFromSource(input);
    const thumb = outputs.find((output) => {
      return output.purpose === "thumb";
    })!;
    expect([thumb.width, thumb.height]).toEqual([400, 400]);
    expect(thumb.byteSize).toBeLessThanOrEqual(128 * 1024);
    expect(await readFile(thumb.path)).not.toEqual(
      await readFile(input.sourcePathOrUrl),
    );
  });

  it("flattens transparency to white without upscaling", async () => {
    const outputs = await makePhotoRenditionsFromSource(
      await _input("transparent.png", 80, 40),
    );
    expect(
      outputs.every((output) => {
        return output.width === 80 && output.height === 40;
      }),
    ).toBe(true);
    const { data } = await sharp(outputs[0]!.path)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
  });

  it("decodes the real rotated HEIC primary, never its embedded thumbnail", async () => {
    const input = await _input("primary.heic", 32, 64);
    const before = await getHashFromFile(input.sourcePathOrUrl);
    const outputs = await makePhotoRenditionsFromSource(input);
    const { data, info } = await sharp(outputs[0]!.path)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([32, 64]);
    expect(data[3 * (16 * 32 + 16)]).toBeGreaterThan(180);
    expect(data[3 * (48 * 32 + 16) + 1]).toBeGreaterThan(160);
    expect(await getHashFromFile(input.sourcePathOrUrl)).toBe(before);
  });

  it("rejects source-size mismatch and foreign scratch without accepted outputs", async () => {
    const input = await _input("transparent.png", 80, 40);
    await expect(
      makePhotoRenditionsFromSource({
        ...input,
        sourceBytes: input.sourceBytes - 1,
      }),
    ).rejects.toThrow("processing_input_invalid");
    await expect(
      makePhotoRenditionsFromSource({ ...input, scratchDirectory: "/tmp" }),
    ).rejects.toThrow("processing_scratch_unavailable");
    expect(await readdir(join(input.runner.scratchPath, "output"))).toEqual([]);
  });
});

it("refuses disguised external-reference formats before invoking a decoder", async () => {
  const input = await _input("transparent.png", 80, 40);
  await writeFile(
    input.sourcePathOrUrl,
    '<svg width="80" height="40"><image href="http://127.0.0.1:1/private"/></svg>',
  );
  input.sourceBytes = (await stat(input.sourcePathOrUrl)).size;
  await expect(makePhotoRenditionsFromSource(input)).rejects.toThrow(
    "processing_input_invalid",
  );
  expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
});

it("refuses a symlinked output directory without creating files outside its job", async () => {
  const input = await _input("transparent.png", 80, 40);
  const sibling = await createVerificationRunner();
  disposers.push(sibling.dispose);
  await rm(join(input.scratchDirectory, "output"), { recursive: true });
  await symlink(
    join(sibling.scratchPath, "output"),
    join(input.scratchDirectory, "output"),
  );
  await expect(makePhotoRenditionsFromSource(input)).rejects.toThrow(
    "processing_scratch_unavailable",
  );
  expect(await readdir(join(sibling.scratchPath, "output"))).toEqual([]);
});

it("reuses an already small JPEG byte-for-byte", async () => {
  const input = await _input("transparent.png", 80, 40);
  const jpeg = await sharp(input.sourcePathOrUrl)
    .flatten({ background: "white" })
    .jpeg()
    .toBuffer();
  await writeFile(input.sourcePathOrUrl, jpeg);
  input.sourceBytes = jpeg.length;
  const outputs = await makePhotoRenditionsFromSource(input);
  expect(await readFile(outputs[0]!.path)).toEqual(jpeg);
});

it("retains measured bytes after exhausting a bounded quality ladder", async () => {
  const input = await _input("heavy.jpg", 400, 400);
  const outputs = await makeImageRenditionsFromFile({
    input,
    source: input.sourcePathOrUrl,
    outputDirectory: join(input.scratchDirectory, "output"),
    candidates: [{ purpose: "thumb", longEdge: 480, bytes: 1 }],
  });
  expect(outputs[0]!.byteSize).toBeGreaterThan(1);
  const measurements = JSON.parse(
    await readFile(
      join(input.scratchDirectory, "photo-measurements.json"),
      "utf8",
    ),
  );
  expect(measurements[0]).toMatchObject({
    quality: 45,
    targetMet: false,
    jpegBytes: outputs[0]!.byteSize,
  });
});

it("cancels a real photo child at the shared deadline without accepting files", async () => {
  const input = await _input("oriented.jpg", 2400, 1600);
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    return originalTimeout(10);
  });
  try {
    await expect(makePhotoRenditionsFromSource(input)).rejects.toThrow(
      "processing_photo_timeout",
    );
    expect(await readdir(join(input.scratchDirectory, "output"))).toEqual([]);
  } finally {
    timeout.mockRestore();
  }
});
