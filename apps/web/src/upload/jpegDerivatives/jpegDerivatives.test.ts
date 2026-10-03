import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getJpegQualityFromEncoder,
  getTargetSizeFromLongEdge,
  makeJpegFromSource,
} from "@/upload/jpegDerivatives/jpegDerivatives";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTargetSizeFromLongEdge", () => {
  it("scales the long edge down to the target, either way up", () => {
    expect(
      getTargetSizeFromLongEdge({
        width: 4032,
        height: 3024,
        longEdgePx: 2048,
      }),
    ).toEqual({ width: 2048, height: 1536 });
    expect(
      getTargetSizeFromLongEdge({ width: 3024, height: 4032, longEdgePx: 480 }),
    ).toEqual({ width: 360, height: 480 });
  });

  it("never upscales", () => {
    expect(
      getTargetSizeFromLongEdge({ width: 800, height: 600, longEdgePx: 2048 }),
    ).toEqual({ width: 800, height: 600 });
  });

  it("never rounds an edge away to nothing", () => {
    expect(
      getTargetSizeFromLongEdge({ width: 1, height: 5000, longEdgePx: 480 }),
    ).toEqual({ width: 1, height: 480 });
  });
});

describe("getJpegQualityFromEncoder", () => {
  it("gives WebKit's encoder its own lower setting", () => {
    expect(getJpegQualityFromEncoder(true)).toBe(0.72);
    expect(getJpegQualityFromEncoder(false)).toBe(0.82);
  });
});

describe("makeJpegFromSource", () => {
  it("answers null, never throws, where there is no canvas to draw on", async () => {
    // jsdom has no OffscreenCanvas: a browser that cannot encode at all.
    vi.stubGlobal("OffscreenCanvas", undefined);

    await expect(
      makeJpegFromSource({
        source: new Image(),
        size: { width: 10, height: 10 },
        quality: 0.82,
      }),
    ).resolves.toBeNull();
  });

  it("drops a blob that came back as anything but a JPEG", async () => {
    // An encoder that answers every request with a PNG, as WebKit does WebP.
    class PngOnlyCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(): object {
        return { fillRect: vi.fn(), drawImage: vi.fn() };
      }
      convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(["x"], { type: "image/png" }));
      }
    }
    vi.stubGlobal("OffscreenCanvas", PngOnlyCanvas);

    await expect(
      makeJpegFromSource({
        source: new Image(),
        size: { width: 10, height: 10 },
        quality: 0.82,
      }),
    ).resolves.toBeNull();
  });
});
