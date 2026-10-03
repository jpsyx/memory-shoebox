import { describe, expect, it } from "vitest";
import { makeAtomBytes, makeJpegBytesFromExif } from "@/testing/mediaBytes";
import {
  getImageHeaderFromFile,
  getLocalDateTimeFromExifDate,
  getOffsetMinutesFromExifOffset,
  getPostOrientationSizeFromHeader,
  makeExifReadableBlobFromFile,
} from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";

/** What a portrait iPhone photograph's header carries. */
const PORTRAIT_EXIF = {
  orientation: 6,
  dateTimeOriginal: "2026:09:14 06:41:32",
  offsetTimeOriginal: "+02:00",
  pixelWidth: 4032,
  pixelHeight: 3024,
};

const EMPTY_HEADER = {
  exifCapturedAtLocal: null,
  exifOffsetMinutes: null,
  width: null,
  height: null,
};

/** The ASCII bytes of a string, as numbers. */
function _ascii(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

describe("getImageHeaderFromFile", () => {
  it("reads the date, the offset and the turned size of a portrait photo", async () => {
    const file = new File(
      [makeJpegBytesFromExif(PORTRAIT_EXIF)],
      "IMG_0001.JPG",
    );

    await expect(getImageHeaderFromFile(file)).resolves.toEqual({
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      exifOffsetMinutes: 120,
      width: 3024,
      height: 4032,
    });
  });

  it("leaves an upright photo's size alone", async () => {
    const file = new File(
      [makeJpegBytesFromExif({ ...PORTRAIT_EXIF, orientation: 1 })],
      "IMG_0002.JPG",
    );

    const header = await getImageHeaderFromFile(file);

    expect([header.width, header.height]).toEqual([4032, 3024]);
  });

  it("reports a date with no offset as a date with no offset", async () => {
    const file = new File(
      [
        makeJpegBytesFromExif({
          dateTimeOriginal: "2026:09:14 23:30:00",
          pixelWidth: 640,
          pixelHeight: 480,
        }),
      ],
      "DSC_0001.JPG",
    );

    await expect(getImageHeaderFromFile(file)).resolves.toEqual({
      exifCapturedAtLocal: "2026-09-14T23:30:00",
      exifOffsetMinutes: null,
      width: 640,
      height: 480,
    });
  });

  it("drops the all-zero date some cameras write for none", async () => {
    const file = new File(
      [makeJpegBytesFromExif({ dateTimeOriginal: "0000:00:00 00:00:00" })],
      "a.jpg",
    );

    const header = await getImageHeaderFromFile(file);

    expect(header.exifCapturedAtLocal).toBeNull();
  });

  it("answers an empty header for a JPEG with no EXIF at all", async () => {
    const file = new File([makeJpegBytesFromExif(undefined)], "forwarded.jpg");

    await expect(getImageHeaderFromFile(file)).resolves.toEqual(EMPTY_HEADER);
  });

  it("answers an empty header, not an error, for bytes exifr cannot read", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "x.heic");

    await expect(getImageHeaderFromFile(file)).resolves.toEqual(EMPTY_HEADER);
  });
});

describe("makeExifReadableBlobFromFile", () => {
  it("rewrites a 52-byte ftyp to 20 bytes and a free box, keeping every offset", async () => {
    const brands = [
      "mif1",
      "MiHB",
      "MiHA",
      "heix",
      "heic",
      "hevc",
      "miaf",
      "MiPr",
      "tmap",
    ];
    const ftyp = makeAtomBytes("ftyp", [
      ..._ascii("heic"),
      ...[0, 0, 0, 0],
      ...brands.flatMap(_ascii),
    ]);
    const rest = [9, 8, 7, 6, 5];
    const file = new Blob([new Uint8Array([...ftyp, ...rest])]);

    const readable = await makeExifReadableBlobFromFile(file);
    const bytes = [...new Uint8Array(await readable.arrayBuffer())];

    expect(ftyp).toHaveLength(52);
    expect(readable.size).toBe(file.size);
    expect(bytes.slice(0, 20)).toEqual(
      makeAtomBytes("ftyp", [..._ascii("heic"), 0, 0, 0, 0, ..._ascii("heic")]),
    );
    expect(bytes.slice(20, 52)).toEqual(
      makeAtomBytes("free", new Array<number>(24).fill(0)),
    );
    expect(bytes.slice(52)).toEqual(rest);
  });

  it("hands back the very same blob when exifr can already read it", async () => {
    const shortFtyp = makeAtomBytes("ftyp", [
      ..._ascii("heic"),
      ...[0, 0, 0, 0],
      ..._ascii("mif1heic"),
    ]);
    const heic = new Blob([new Uint8Array([...shortFtyp, 1, 2, 3])]);
    const jpeg = new Blob([makeJpegBytesFromExif(PORTRAIT_EXIF)]);

    await expect(makeExifReadableBlobFromFile(heic)).resolves.toBe(heic);
    await expect(makeExifReadableBlobFromFile(jpeg)).resolves.toBe(jpeg);
  });
});

describe("getLocalDateTimeFromExifDate", () => {
  it("turns the EXIF form into an offset-less ISO wall clock", () => {
    expect(getLocalDateTimeFromExifDate("2026:09:14 06:41:32")).toBe(
      "2026-09-14T06:41:32",
    );
  });

  it("refuses anything that is not exactly that shape or not a real time", () => {
    expect(getLocalDateTimeFromExifDate("2026-09-14 06:41:32")).toBeNull();
    expect(getLocalDateTimeFromExifDate("2026:13:14 06:41:32")).toBeNull();
    expect(getLocalDateTimeFromExifDate("2026:09:14 24:00:00")).toBeNull();
    expect(getLocalDateTimeFromExifDate("    :  :     :  :  ")).toBeNull();
  });
});

describe("getOffsetMinutesFromExifOffset", () => {
  it("reads east as positive and west as negative", () => {
    expect(getOffsetMinutesFromExifOffset("+02:00")).toBe(120);
    expect(getOffsetMinutesFromExifOffset("-05:30")).toBe(-330);
    expect(getOffsetMinutesFromExifOffset("+00:00")).toBe(0);
  });

  it("refuses an offset no clock on Earth uses", () => {
    expect(getOffsetMinutesFromExifOffset("+15:00")).toBeNull();
    expect(getOffsetMinutesFromExifOffset("+02:75")).toBeNull();
    expect(getOffsetMinutesFromExifOffset("Z")).toBeNull();
  });
});

describe("getPostOrientationSizeFromHeader", () => {
  it("swaps the box for the four quarter turns and nothing else", () => {
    const widths = [1, 2, 3, 4, 5, 6, 7, 8].map((orientation) => {
      return getPostOrientationSizeFromHeader({
        width: 4,
        height: 3,
        orientation,
      }).width;
    });

    expect(widths).toEqual([4, 4, 4, 4, 3, 3, 3, 3]);
    expect(getPostOrientationSizeFromHeader({ width: 4, height: 3 })).toEqual({
      width: 4,
      height: 3,
    });
  });
});
