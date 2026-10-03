import { afterEach, describe, expect, it, vi } from "vitest";
import { makeJpegBytesFromExif } from "@/testing/mediaBytes";
import {
  getDecodeSizeFromPlan,
  getDerivativePlanFromSize,
  makeImageDerivatives,
} from "@/upload/makeImageDerivatives/makeImageDerivatives";

const DISPLAY = { purpose: "display", longEdgePx: 2048 };
const THUMB = { purpose: "thumb", longEdgePx: 480 };

/** A JPEG with no EXIF, as the blob a picker would hand over. */
function _jpegBlob(): Blob {
  return new Blob([makeJpegBytesFromExif(undefined)], { type: "image/jpeg" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDerivativePlanFromSize", () => {
  it("plans both for a full-size photograph", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 4032, height: 3024 },
      }),
    ).toEqual([DISPLAY, THUMB]);
  });

  it("skips what a JPEG already is: a 1600 px one needs only a thumb", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 1600, height: 1200 },
      }),
    ).toEqual([THUMB]);
  });

  it("makes nothing from a JPEG already thumbnail-sized", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 480, height: 360 },
      }),
    ).toEqual([]);
  });

  it("still re-encodes a small PNG or HEIC, which is no JPEG to fall back to", () => {
    const small = { width: 800, height: 600 };

    expect(
      getDerivativePlanFromSize({ contentType: "image/png", size: small }),
    ).toEqual([DISPLAY, THUMB]);
    expect(
      getDerivativePlanFromSize({ contentType: "image/heic", size: small }),
    ).toEqual([DISPLAY, THUMB]);
  });

  it("plans both when the header had no size, to decide after the decode", () => {
    expect(
      getDerivativePlanFromSize({ contentType: "image/jpeg", size: null }),
    ).toEqual([DISPLAY, THUMB]);
  });
});

describe("getDecodeSizeFromPlan", () => {
  it("decodes straight to the largest planned size", () => {
    expect(
      getDecodeSizeFromPlan({
        size: { width: 4032, height: 3024 },
        plan: [
          { purpose: "display", longEdgePx: 2048 },
          { purpose: "thumb", longEdgePx: 480 },
        ],
      }),
    ).toEqual({ width: 2048, height: 1536 });
  });

  it("decodes at native size when the largest target is no shrink", () => {
    expect(
      getDecodeSizeFromPlan({
        size: { width: 800, height: 600 },
        plan: [{ purpose: "display", longEdgePx: 2048 }],
      }),
    ).toBeNull();
  });

  it("decodes at native size when the size is not known yet", () => {
    expect(
      getDecodeSizeFromPlan({
        size: null,
        plan: [{ purpose: "display", longEdgePx: 2048 }],
      }),
    ).toBeNull();
  });
});

describe("makeImageDerivatives", () => {
  it("drops what it cannot decode, rather than throwing", async () => {
    const decode = vi.fn(async () => {
      throw new DOMException(
        "The source image could not be decoded.",
        "InvalidStateError",
      );
    });
    vi.stubGlobal("createImageBitmap", decode);
    const file = _jpegBlob();

    await expect(
      makeImageDerivatives({
        file,
        contentType: "image/jpeg",
        size: { width: 4032, height: 3024 },
      }),
    ).resolves.toEqual({
      derivatives: [],
      usedWasmDecoder: false,
      originalSize: { width: 4032, height: 3024 },
    });
    expect(decode).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
      resizeWidth: 2048,
      resizeHeight: 1536,
      resizeQuality: "high",
    });
  });

  it("does not decode at all when there is nothing to make", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(
      makeImageDerivatives({
        file: _jpegBlob(),
        contentType: "image/jpeg",
        size: { width: 320, height: 240 },
      }),
    ).resolves.toEqual({
      derivatives: [],
      usedWasmDecoder: false,
      originalSize: { width: 320, height: 240 },
    });
    expect(decode).not.toHaveBeenCalled();
  });
});
