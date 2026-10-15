import { afterEach, describe, expect, it, vi } from "vitest";

import { makeJpegBytesFromExif } from "@/testing/mediaBytesHelpers/mediaBytesHelpers";

import { makeImageDataFromHeic } from "@/upload/makeImageDataFromHeic/makeImageDataFromHeic";

import { makeImageDerivativesFromFile } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile";

vi.mock("@/upload/makeImageDataFromHeic/makeImageDataFromHeic", () => {
  return { makeImageDataFromHeic: vi.fn() };
});

/** A JPEG with no EXIF, as the blob a picker would hand over. */
function _jpegBlob(): Blob {
  return new Blob([makeJpegBytesFromExif(undefined)], { type: "image/jpeg" });
}

/** A decoded picture the stubbed `createImageBitmap` hands out. */
function _makeBitmapStub(size: { width: number; height: number }): {
  width: number;
  height: number;
  close: () => void;
} {
  return { ...size, close: vi.fn() };
}

/** A canvas that draws nothing and encodes whatever type it is asked for. */
class EncodingCanvas {
  getContext(): object {
    return { fillRect: vi.fn(), drawImage: vi.fn() };
  }
  convertToBlob(request: { type: string }): Promise<Blob> {
    return Promise.resolve(new Blob(["x"], { type: request.type }));
  }
}

/** A canvas whose encoder fails every time. */
class BrokenCanvas {
  getContext(): object {
    return { fillRect: vi.fn(), drawImage: vi.fn() };
  }
  convertToBlob(): Promise<Blob> {
    return Promise.reject(new Error("The encoder died."));
  }
}

/** What the tests care about in a made derivative. */
function _getShapesFromDerivatives(
  derivatives: ReadonlyArray<{
    purpose: string;
    width: number;
    height: number;
  }>,
): Array<{ purpose: string; width: number; height: number }> {
  return derivatives.map(({ purpose, width, height }) => {
    return { purpose, width, height };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(makeImageDataFromHeic).mockReset();
});
describe("makeImageDerivatives", () => {
  it("preview encodes only a thumbnail", async () => {
    const bitmap = _makeBitmapStub({ width: 480, height: 360 });
    const decode = vi.fn(async () => {
      return bitmap;
    });
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("OffscreenCanvas", EncodingCanvas);
    const made = await makeImageDerivativesFromFile({
      file: _jpegBlob(),
      contentType: "image/jpeg",
      size: { width: 4032, height: 3024 },
      purposes: ["thumb"],
    });
    const encodedPurposes = made.derivatives.map(({ purpose }) => {
      return purpose;
    });
    expect(encodedPurposes).toEqual(["thumb"]);
    expect(decode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resizeWidth: 480 }),
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
describe("makeImageDerivatives", () => {
  it("encodes an oversized JPEG even when its dimensions fit a thumbnail", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      return _makeBitmapStub({ width: 320, height: 240 });
    });
    vi.stubGlobal("OffscreenCanvas", EncodingCanvas);
    const made = await makeImageDerivativesFromFile({
      file: new Blob([new Uint8Array(129 * 1024)], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      size: { width: 320, height: 240 },
      purposes: ["thumb"],
    });
    expect(
      made.derivatives.map(({ purpose }) => {
        return purpose;
      }),
    ).toEqual(["thumb"]);
  });
});
describe("makeImageDerivatives", () => {
  it("drops what it cannot decode, rather than throwing, and says why", async () => {
    const decode = vi.fn(async () => {
      throw new DOMException(
        "The source image could not be decoded.",
        "InvalidStateError",
      );
    });
    vi.stubGlobal("createImageBitmap", decode);
    const file = _jpegBlob();

    const made = await makeImageDerivativesFromFile({
      file,
      contentType: "image/jpeg",
      size: { width: 4032, height: 3024 },
    });

    expect(made).toMatchObject({
      derivatives: [],
      usedWasmDecoder: false,
      originalSize: { width: 4032, height: 3024 },
    });
    expect(made.dropDetail).toMatch(/could not decode/);
    expect(makeImageDataFromHeic).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
      resizeWidth: 2048,
      resizeQuality: "high",
    });
  });
});
describe("makeImageDerivatives", () => {
  it("resizes a portrait photograph by its height, the long edge", async () => {
    const decode = vi.fn(async () => {
      throw new DOMException("Cannot decode.", "InvalidStateError");
    });
    vi.stubGlobal("createImageBitmap", decode);

    await makeImageDerivativesFromFile({
      file: _jpegBlob(),
      contentType: "image/jpeg",
      size: { width: 3024, height: 4032 },
    });

    expect(decode).toHaveBeenCalledWith(expect.anything(), {
      imageOrientation: "from-image",
      resizeHeight: 2048,
      resizeQuality: "high",
    });
  });
});
describe("makeImageDerivatives", () => {
  it("does not decode at all when there is nothing to make", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    const made = await makeImageDerivativesFromFile({
      file: _jpegBlob(),
      contentType: "image/jpeg",
      size: { width: 320, height: 240 },
    });

    expect(made).toEqual({
      derivatives: [],
      usedWasmDecoder: false,
      originalSize: { width: 320, height: 240 },
    });
    expect(made.dropDetail).toBeUndefined();
    expect(decode).not.toHaveBeenCalled();
  });
});
describe("makeImageDerivatives", () => {
  it("makes both JPEGs from one decode and closes the bitmap", async () => {
    const bitmap = _makeBitmapStub({ width: 2048, height: 1536 });
    const decode = vi.fn(async () => {
      return bitmap;
    });
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("OffscreenCanvas", EncodingCanvas);

    const made = await makeImageDerivativesFromFile({
      file: _jpegBlob(),
      contentType: "image/jpeg",
      size: { width: 4032, height: 3024 },
    });

    expect(_getShapesFromDerivatives(made.derivatives)).toEqual([
      { purpose: "display", width: 2048, height: 1536 },
      { purpose: "thumb", width: 480, height: 360 },
    ]);
    expect(
      made.derivatives.every(({ blob }) => {
        return blob.type === "image/jpeg";
      }),
    ).toBe(true);
    expect(made.dropDetail).toBeUndefined();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
describe("makeImageDerivatives", () => {
  it("plans again from the decoded size when the header had none", async () => {
    const bitmap = _makeBitmapStub({ width: 1600, height: 1200 });
    const decode = vi.fn(async () => {
      return bitmap;
    });
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("OffscreenCanvas", EncodingCanvas);
    const file = _jpegBlob();

    const made = await makeImageDerivativesFromFile({
      file,
      contentType: "image/jpeg",
      size: undefined,
    });

    // No header size, so no resize on decode and the bitmap is native...
    expect(decode).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
    });
    // ...and a 1600 px JPEG is already a display, so only a thumb is made.
    expect(_getShapesFromDerivatives(made.derivatives)).toEqual([
      { purpose: "thumb", width: 480, height: 360 },
    ]);
    expect(made.originalSize).toEqual({ width: 1600, height: 1200 });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
describe("makeImageDerivatives", () => {
  it("closes the bitmap and says what it dropped when the encoder fails", async () => {
    const bitmap = _makeBitmapStub({ width: 2048, height: 1536 });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        return bitmap;
      }),
    );
    vi.stubGlobal("OffscreenCanvas", BrokenCanvas);

    const made = await makeImageDerivativesFromFile({
      file: _jpegBlob(),
      contentType: "image/jpeg",
      size: { width: 4032, height: 3024 },
    });

    expect(made.derivatives).toEqual([]);
    expect(made.dropDetail).toMatch(/could not encode.*display, thumb/);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
describe("makeImageDerivatives", () => {
  it("falls back to libheif for a HEIC the browser cannot decode", async () => {
    const pixels: ImageData = {
      width: 4000,
      height: 3000,
      data: new Uint8ClampedArray(4),
      colorSpace: "srgb",
    };
    vi.mocked(makeImageDataFromHeic).mockResolvedValue(pixels);
    const bitmap = _makeBitmapStub({ width: 2048, height: 1536 });
    const decode = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException("Cannot decode.", "InvalidStateError"),
      )
      .mockResolvedValueOnce(bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("OffscreenCanvas", EncodingCanvas);
    const file = new Blob(["heic"], { type: "image/heic" });

    const made = await makeImageDerivativesFromFile({
      file,
      contentType: "image/heic",
      size: { width: 4000, height: 3000 },
    });

    expect(makeImageDataFromHeic).toHaveBeenCalledWith(file);
    expect(decode).toHaveBeenNthCalledWith(2, pixels, {
      resizeWidth: 2048,
      resizeQuality: "high",
    });
    expect(_getShapesFromDerivatives(made.derivatives)).toEqual([
      { purpose: "display", width: 2048, height: 1536 },
      { purpose: "thumb", width: 480, height: 360 },
    ]);
    expect(made.usedWasmDecoder).toBe(true);
    expect(made.originalSize).toEqual({ width: 4000, height: 3000 });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
describe("makeImageDerivatives", () => {
  it("counts a libheif attempt that failed, and says why it dropped", async () => {
    vi.mocked(makeImageDataFromHeic).mockRejectedValue(
      new Error("libheif aborted: out of memory"),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("Cannot decode.", "InvalidStateError");
      }),
    );

    const made = await makeImageDerivativesFromFile({
      file: new Blob(["heic"], { type: "image/heif" }),
      contentType: "image/heif",
      size: { width: 4000, height: 3000 },
    });

    expect(made.derivatives).toEqual([]);
    expect(made.usedWasmDecoder).toBe(true);
    expect(made.dropDetail).toMatch(/HEIC decoder.*out of memory/);
  });
});
