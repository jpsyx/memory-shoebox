import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { visualFingerprintSchema } from "@memory-shoebox/shared";
import { makeImageDataFromHeic } from "@/upload/makeImageDataFromHeic/makeImageDataFromHeic";
import { answerMediaWorkerRequest } from "./answerMediaWorkerRequest/answerMediaWorkerRequest";
import { makeMediaWorkerClientFromPort } from "./makeMediaWorkerClientFromPort";
import type { MediaWorkerPort } from "./mediaWorkerProtocol.types";

vi.mock("@/upload/makeImageDataFromHeic/makeImageDataFromHeic", () => {
  return { makeImageDataFromHeic: vi.fn() };
});

type CanvasContext = {
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  fillRect: Mock;
  drawImage: Mock;
  getImageData: Mock<() => { data: Uint8ClampedArray }>;
};

type BitmapStub = { width: number; height: number; close: Mock };

type CanvasHarness = {
  context: CanvasContext;
  getContext: Mock<() => CanvasContext>;
  bitmap: BitmapStub;
  decode: Mock<() => Promise<BitmapStub>>;
};

function _makeCanvasHarness(isFlat = false): CanvasHarness {
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  pixels.forEach((_, index) => {
    pixels[index] =
      index % 4 === 3 ? 255 : isFlat ? 128 : Math.floor(index / 4) % 256;
  });
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      return { data: pixels };
    }),
  };
  const getContext = vi.fn(() => {
    return context;
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(width: number, height: number) {
        expect([width, height]).toEqual([32, 32]);
      }
      getContext = getContext;
    },
  );
  const bitmap = { width: 128, height: 96, close: vi.fn() };
  const decode = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal("createImageBitmap", decode);
  return { context, getContext, bitmap, decode };
}

const FILE_OPTIONS = {
  file: new Blob(["original bytes"], { type: "image/jpeg" }),
  contentType: "image/jpeg",
  size: { width: 4032, height: 3024 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("visual fingerprint media requests", () => {
  it("normalizes oriented full-frame pixels over white in sRGB and releases its bitmap", async () => {
    const { context, getContext, bitmap, decode } = _makeCanvasHarness();
    const response = await answerMediaWorkerRequest({
      kind: "fingerprint",
      requestId: 71,
      ...FILE_OPTIONS,
    });
    expect(response).toMatchObject({
      kind: "fingerprinted",
      requestId: 71,
      usedWasmDecoder: false,
      originalSize: { width: 4032, height: 3024 },
    });
    if (response.kind !== "fingerprinted") {
      throw new Error("Missing fingerprint response");
    }
    expect(
      visualFingerprintSchema.safeParse(response.visualFingerprint).success,
    ).toBe(true);
    expect(decode).toHaveBeenCalledWith(FILE_OPTIONS.file, {
      imageOrientation: "from-image",
      resizeWidth: 128,
      resizeQuality: "high",
    });
    expect(getContext).toHaveBeenCalledWith("2d", {
      colorSpace: "srgb",
      willReadFrequently: true,
    });
    expect(context.fillStyle).toBe("white");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 32, 32);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(
      new TextDecoder().decode(await FILE_OPTIONS.file.arrayBuffer()),
    ).toBe("original bytes");
  });

  it("returns oriented native dimensions when the header omitted them", async () => {
    const { bitmap, decode } = _makeCanvasHarness();
    bitmap.width = 240;
    bitmap.height = 360;
    await expect(
      answerMediaWorkerRequest({
        kind: "fingerprint",
        requestId: 72,
        ...FILE_OPTIONS,
        size: undefined,
      }),
    ).resolves.toMatchObject({
      kind: "fingerprinted",
      originalSize: { width: 240, height: 360 },
    });
    expect(decode).toHaveBeenCalledWith(FILE_OPTIONS.file, {
      imageOrientation: "from-image",
    });
  });

  it("keeps dimensions absent when an image without header dimensions cannot decode", async () => {
    const { decode } = _makeCanvasHarness();
    decode.mockRejectedValue(new Error("Cannot decode"));
    await expect(
      answerMediaWorkerRequest({
        kind: "fingerprint",
        requestId: 73,
        ...FILE_OPTIONS,
        size: undefined,
      }),
    ).resolves.toMatchObject({
      kind: "fingerprinted",
      visualFingerprint: undefined,
      originalSize: undefined,
    });
  });

  it("keeps featureless images eligible without a visual fingerprint", async () => {
    _makeCanvasHarness(true);
    await expect(
      answerMediaWorkerRequest({
        kind: "fingerprint",
        requestId: 1,
        ...FILE_OPTIONS,
      }),
    ).resolves.toMatchObject({
      kind: "fingerprinted",
      visualFingerprint: undefined,
      usedWasmDecoder: false,
    });
  });

  it("uses the existing HEIC fallback and reports the WASM attempt for recycling", async () => {
    const { decode, bitmap } = _makeCanvasHarness();
    const pixels = {
      width: 3000,
      height: 4000,
      data: new Uint8ClampedArray(4),
      colorSpace: "srgb",
    } satisfies ImageData;
    vi.mocked(makeImageDataFromHeic).mockResolvedValue(pixels);
    decode
      .mockRejectedValueOnce(new Error("Unsupported HEIC"))
      .mockResolvedValueOnce(bitmap);
    const file = new Blob(["heic"], { type: "image/heic" });
    await expect(
      answerMediaWorkerRequest({
        kind: "fingerprint",
        requestId: 2,
        file,
        contentType: "image/heic",
        size: { width: 3000, height: 4000 },
      }),
    ).resolves.toMatchObject({ kind: "fingerprinted", usedWasmDecoder: true });
    expect(makeImageDataFromHeic).toHaveBeenCalledWith(file);
    expect(decode).toHaveBeenNthCalledWith(2, pixels, {
      resizeHeight: 128,
      resizeQuality: "high",
    });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it.each(["decode", "canvas"])(
    "treats a %s failure as absent evidence",
    async (failure) => {
      const { decode, context, bitmap } = _makeCanvasHarness();
      if (failure === "decode") {
        decode.mockRejectedValue(new Error("Cannot decode"));
      } else {
        context.getImageData.mockImplementation(() => {
          throw new Error("Cannot read pixels");
        });
      }
      await expect(
        answerMediaWorkerRequest({
          kind: "fingerprint",
          requestId: 3,
          ...FILE_OPTIONS,
        }),
      ).resolves.toMatchObject({
        kind: "fingerprinted",
        visualFingerprint: undefined,
        usedWasmDecoder: false,
      });
      if (failure === "canvas") {
        expect(bitmap.close).toHaveBeenCalledOnce();
      }
    },
  );

  it("pairs a fingerprint response with its own client request", async () => {
    _makeCanvasHarness();
    const port: MediaWorkerPort = {
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
      postMessage: (request) => {
        void answerMediaWorkerRequest(request).then((data) => {
          port.onmessage?.(new MessageEvent("message", { data }));
        });
      },
    };
    const client = makeMediaWorkerClientFromPort(port);
    const result = await client.makeVisualFingerprintFromFile(FILE_OPTIONS);
    expect(result.originalSize).toEqual({ width: 4032, height: 3024 });
    expect(
      visualFingerprintSchema.safeParse(result.visualFingerprint).success,
    ).toBe(true);
  });
});
