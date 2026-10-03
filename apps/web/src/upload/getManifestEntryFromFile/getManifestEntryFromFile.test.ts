import { describe, expect, it } from "vitest";
import {
  makeAtomBytes,
  makeJpegBytesFromExif,
  makeMvhdAtomBytes,
  makeTkhdAtomBytes,
} from "@/testing/mediaBytes";
import {
  getDeclaredContentTypeFromFile,
  getManifestEntryFromFile,
} from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";

const MODIFIED_MS = Date.UTC(2026, 8, 20, 18, 5, 0);
const MODIFIED_AT = "2026-09-20T18:05:00.000Z";

describe("getManifestEntryFromFile", () => {
  it("declares a photograph with its EXIF evidence and its upright size", async () => {
    const bytes = makeJpegBytesFromExif({
      orientation: 6,
      dateTimeOriginal: "2026:09:14 06:41:32",
      offsetTimeOriginal: "+02:00",
      pixelWidth: 4032,
      pixelHeight: 3024,
    });
    const file = new File([bytes], "IMG_0001.JPG", {
      type: "image/jpeg",
      lastModified: MODIFIED_MS,
    });

    await expect(
      getManifestEntryFromFile({ file, clientRef: "7" }),
    ).resolves.toEqual({
      clientRef: "7",
      originalFilename: "IMG_0001.JPG",
      declaredContentType: "image/jpeg",
      declaredBytes: bytes.byteLength,
      capture: {
        exifCapturedAtLocal: "2026-09-14T06:41:32",
        exifOffsetMinutes: 120,
        lastModifiedAt: MODIFIED_AT,
      },
      width: 3024,
      height: 4032,
      durationMs: null,
    });
  });

  it("declares a video with its creation time, duration and turned size", async () => {
    const mvhd = makeMvhdAtomBytes({
      version: 0,
      createdAt: new Date("2026-09-14T06:41:32.000Z"),
      timescale: 600,
      duration: 600 * 12,
    });
    const bytes = new Uint8Array([
      ...makeAtomBytes("ftyp", [0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0]),
      ...makeAtomBytes("mdat", new Array<number>(256).fill(0)),
      ...makeAtomBytes("moov", [
        ...mvhd,
        ...makeAtomBytes(
          "trak",
          makeTkhdAtomBytes({
            version: 0,
            width: 1920,
            height: 1080,
            quarterTurns: 1,
          }),
        ),
      ]),
    ]);
    const file = new File([bytes], "IMG_0002.MOV", {
      type: "video/quicktime",
      lastModified: MODIFIED_MS,
    });

    await expect(
      getManifestEntryFromFile({ file, clientRef: "8" }),
    ).resolves.toEqual({
      clientRef: "8",
      originalFilename: "IMG_0002.MOV",
      declaredContentType: "video/quicktime",
      declaredBytes: bytes.byteLength,
      capture: {
        videoCreationTime: "2026-09-14T06:41:32.000Z",
        lastModifiedAt: MODIFIED_AT,
      },
      width: 1080,
      height: 1920,
      durationMs: 12_000,
    });
  });

  it("falls back to the extension when the browser left the type empty", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "IMG_0003.HEIC", {
      lastModified: MODIFIED_MS,
    });

    const entry = await getManifestEntryFromFile({ file, clientRef: "9" });

    expect(file.type).toBe("");
    expect(entry.declaredContentType).toBe("image/heic");
    expect(entry.capture).toEqual({
      exifCapturedAtLocal: null,
      exifOffsetMinutes: null,
      lastModifiedAt: MODIFIED_AT,
    });
  });

  it("reads nothing from a file the server will refuse, and still declares it", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
      "menu.pdf",
      { type: "application/pdf", lastModified: MODIFIED_MS },
    );

    await expect(
      getManifestEntryFromFile({ file, clientRef: "10" }),
    ).resolves.toEqual({
      clientRef: "10",
      originalFilename: "menu.pdf",
      declaredContentType: "application/pdf",
      declaredBytes: 4,
      capture: { lastModifiedAt: MODIFIED_AT },
    });
  });
});

describe("getDeclaredContentTypeFromFile", () => {
  it("prefers the browser's type, lowercased", () => {
    expect(
      getDeclaredContentTypeFromFile({ name: "a.jpg", type: "IMAGE/JPEG" }),
    ).toBe("image/jpeg");
  });

  it("maps every accepted extension, in any case", () => {
    const names = [
      "a.HEIC",
      "a.heif",
      "a.JPG",
      "a.jpeg",
      "a.png",
      "a.webp",
      "a.gif",
      "a.MOV",
      "a.mp4",
    ];

    expect(
      names.map((name) => {
        return getDeclaredContentTypeFromFile({ name, type: "" });
      }),
    ).toEqual([
      "image/heic",
      "image/heif",
      "image/jpeg",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/quicktime",
      "video/mp4",
    ]);
  });

  it("declares anything else as an octet stream, for the server to refuse", () => {
    expect(getDeclaredContentTypeFromFile({ name: "notes", type: "" })).toBe(
      "application/octet-stream",
    );
  });
});
