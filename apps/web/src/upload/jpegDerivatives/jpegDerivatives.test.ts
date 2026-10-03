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

/**
 * An OffscreenCanvas whose encoder answers every request with `answersWith`.
 * Like Chromium's, it refuses to encode until a 2d context was taken from it.
 * `log` records what was asked of it, in order.
 */
function _makeEncoderStub(options: { answersWith: string; log: string[] }) {
  return class EncoderStub {
    isContextTaken = false;
    constructor() {
      options.log.push("new");
    }
    getContext(): object {
      this.isContextTaken = true;
      options.log.push("getContext");
      return {};
    }
    convertToBlob(request: { type: string }): Promise<Blob> {
      options.log.push(`convertToBlob ${request.type}`);
      if (!this.isContextTaken) {
        return Promise.reject(
          new DOMException("No context.", "InvalidStateError"),
        );
      }
      return Promise.resolve(new Blob(["x"], { type: options.answersWith }));
    }
  };
}

/** `isWebKitImageEncoder` from a fresh module: its answer is cached. */
async function _freshIsWebKitImageEncoder(): Promise<() => Promise<boolean>> {
  vi.resetModules();
  const fresh = await import("@/upload/jpegDerivatives/jpegDerivatives");
  return fresh.isWebKitImageEncoder;
}

describe("isWebKitImageEncoder", () => {
  it("reads WebKit from an encoder that answers a WebP request with a PNG", async () => {
    const log: string[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      _makeEncoderStub({ answersWith: "image/png", log }),
    );
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await expect(isWebKitImageEncoder()).resolves.toBe(true);
  });

  it("reads Chromium from an encoder that makes the WebP", async () => {
    const log: string[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      _makeEncoderStub({ answersWith: "image/webp", log }),
    );
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await expect(isWebKitImageEncoder()).resolves.toBe(false);
  });

  it("takes a 2d context before it encodes, as Chromium needs", async () => {
    const log: string[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      _makeEncoderStub({ answersWith: "image/webp", log }),
    );
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await isWebKitImageEncoder();

    expect(log).toEqual(["new", "getContext", "convertToBlob image/webp"]);
  });

  it("answers false, never throws, where there is no canvas at all", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await expect(isWebKitImageEncoder()).resolves.toBe(false);
  });

  it("answers false, and does not encode, when there is no 2d context", async () => {
    const log: string[] = [];
    class NoContextCanvas {
      getContext(): null {
        log.push("getContext");
        return null;
      }
      convertToBlob(): Promise<Blob> {
        log.push("convertToBlob");
        return Promise.resolve(new Blob(["x"], { type: "image/png" }));
      }
    }
    vi.stubGlobal("OffscreenCanvas", NoContextCanvas);
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await expect(isWebKitImageEncoder()).resolves.toBe(false);
    expect(log).toEqual(["getContext"]);
  });

  it("asks the encoder once, however often it is asked", async () => {
    const log: string[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      _makeEncoderStub({ answersWith: "image/png", log }),
    );
    const isWebKitImageEncoder = await _freshIsWebKitImageEncoder();

    await isWebKitImageEncoder();
    await isWebKitImageEncoder();

    expect(
      log.filter((entry) => {
        return entry === "new";
      }),
    ).toHaveLength(1);
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

  it("gives the canvas back even when the encode fails", async () => {
    const canvases: Array<{ width: number; height: number }> = [];
    class FailingCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        canvases.push(this);
      }
      getContext(): object {
        return { fillRect: vi.fn(), drawImage: vi.fn() };
      }
      convertToBlob(): Promise<Blob> {
        return Promise.reject(new Error("The encoder died."));
      }
    }
    vi.stubGlobal("OffscreenCanvas", FailingCanvas);

    await expect(
      makeJpegFromSource({
        source: new Image(),
        size: { width: 2048, height: 1536 },
        quality: 0.82,
      }),
    ).resolves.toBeNull();
    expect(canvases[0]).toMatchObject({ width: 1, height: 1 });
  });
});
