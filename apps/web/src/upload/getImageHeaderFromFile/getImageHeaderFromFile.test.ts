import { describe, expect, it } from "vitest";
import { makeAtomBytesFromTypeAndBody } from "@/testing/mediaBytesHelpers/mediaAtomBytesHelpers";
import {
  makeHeicBytesFromExif,
  makeJpegBytesFromExif,
  makePngBytesFromSize,
} from "@/testing/mediaBytesHelpers/mediaBytesHelpers";
import { getImageHeaderFromFile } from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";
import { getLocalDateTimeFromExifDate } from "@/upload/getImageHeaderFromFile/getLocalDateTimeFromExifDate";
import { getOffsetMinutesFromExifOffset } from "@/upload/getImageHeaderFromFile/getOffsetMinutesFromExifOffset";
import { getPostOrientationSizeFromHeader } from "@/upload/getImageHeaderFromFile/getPostOrientationSizeFromHeader";
import { makeExifReadableBlobFromFile } from "@/upload/getImageHeaderFromFile/makeExifReadableBlobFromFile";

/** What a portrait iPhone photograph's header carries. */
const PORTRAIT_EXIF = {
  orientation: 6,
  dateTimeOriginal: "2026:09:14 06:41:32",
  offsetTimeOriginal: "+02:00",
  pixelWidth: 4032,
  pixelHeight: 3024,
};

/** The nine brands the newest iPhones write, which make a 52-byte `ftyp`. */
const NEWEST_IPHONE_BRANDS = [
  "mif1",
  "MiHB",
  "MiHA",
  "heix",
  "heic",
  "hevc",
  "miaf",
  "MiPr",
  "tmap",
] as const;

const EMPTY_HEADER = {
  exifCapturedAtLocal: undefined,
  exifOffsetMinutes: undefined,
  width: undefined,
  height: undefined,
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
      exifOffsetMinutes: undefined,
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

    expect(header.exifCapturedAtLocal).toBeUndefined();
  });

  it("answers an empty header for a JPEG with no EXIF at all", async () => {
    const file = new File([makeJpegBytesFromExif(undefined)], "forwarded.jpg");

    await expect(getImageHeaderFromFile(file)).resolves.toEqual(EMPTY_HEADER);
  });

  it("reads a screenshot's size from its PNG IHDR, which has no EXIF at all", async () => {
    const file = new File(
      [makePngBytesFromSize({ width: 1170, height: 2532 })],
      "Screenshot.png",
    );

    await expect(getImageHeaderFromFile(file)).resolves.toEqual({
      ...EMPTY_HEADER,
      width: 1170,
      height: 2532,
    });
  });

  it("reads a HEIC with the 52-byte ftyp exifr refuses, through the rewrite", async () => {
    const bytes = makeHeicBytesFromExif({
      fields: PORTRAIT_EXIF,
      compatibleBrands: NEWEST_IPHONE_BRANDS,
    });
    const file = new File([bytes], "IMG_0004.HEIC");

    expect(new DataView(bytes.buffer).getUint32(0)).toBe(52);
    await expect(getImageHeaderFromFile(file)).resolves.toEqual({
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      exifOffsetMinutes: 120,
      width: 3024,
      height: 4032,
    });
  });

  it("reads a HEIC with a short ftyp as it is", async () => {
    const bytes = makeHeicBytesFromExif({
      fields: PORTRAIT_EXIF,
      compatibleBrands: ["heic"],
    });
    const file = new File([bytes], "IMG_0005.HEIC");

    expect(new DataView(bytes.buffer).getUint32(0)).toBe(20);
    await expect(getImageHeaderFromFile(file)).resolves.toEqual({
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      exifOffsetMinutes: 120,
      width: 3024,
      height: 4032,
    });
  });

  it("answers an empty header, not an error, for bytes exifr cannot read", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "x.heic");

    await expect(getImageHeaderFromFile(file)).resolves.toEqual(EMPTY_HEADER);
  });
});

describe("makeExifReadableBlobFromFile", () => {
  it("rewrites a 52-byte ftyp to 20 bytes and a free box, keeping every offset", async () => {
    const ftyp = makeAtomBytesFromTypeAndBody({
      type: "ftyp",
      body: [
        ..._ascii("heic"),
        ...[0, 0, 0, 0],
        ...NEWEST_IPHONE_BRANDS.flatMap(_ascii),
      ],
    });
    const rest = [9, 8, 7, 6, 5];
    const file = new Blob([new Uint8Array([...ftyp, ...rest])]);

    const readable = await makeExifReadableBlobFromFile(file);
    const bytes = [...new Uint8Array(await readable.arrayBuffer())];

    expect(ftyp).toHaveLength(52);
    expect(readable.size).toBe(file.size);
    expect(bytes.slice(0, 20)).toEqual(
      makeAtomBytesFromTypeAndBody({
        type: "ftyp",
        body: [..._ascii("heic"), 0, 0, 0, 0, ..._ascii("heic")],
      }),
    );
    expect(bytes.slice(20, 52)).toEqual(
      makeAtomBytesFromTypeAndBody({
        type: "free",
        body: new Array<number>(24).fill(0),
      }),
    );
    expect(bytes.slice(52)).toEqual(rest);
  });

  it("hands back the very same blob when exifr can already read it", async () => {
    const shortFtyp = makeAtomBytesFromTypeAndBody({
      type: "ftyp",
      body: [..._ascii("heic"), ...[0, 0, 0, 0], ..._ascii("mif1heic")],
    });
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

  it("reads the dashed and the T forms writers use, and drops fractional seconds", () => {
    expect(getLocalDateTimeFromExifDate("2026-09-14 06:41:32")).toBe(
      "2026-09-14T06:41:32",
    );
    expect(getLocalDateTimeFromExifDate("2026-09-14T06:41:32")).toBe(
      "2026-09-14T06:41:32",
    );
    expect(getLocalDateTimeFromExifDate("2026-09-14T06:41:32.250")).toBe(
      "2026-09-14T06:41:32",
    );
    expect(getLocalDateTimeFromExifDate("2026:09:14 06:41:32.5")).toBe(
      "2026-09-14T06:41:32",
    );
  });

  it("refuses anything else, and anything that is not a real time", () => {
    expect(getLocalDateTimeFromExifDate("2026:09:14T06:41:32")).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("2026/09/14 06:41:32")).toBeUndefined();
    expect(
      getLocalDateTimeFromExifDate("2026-09-14T06:41:32Z"),
    ).toBeUndefined();
    expect(
      getLocalDateTimeFromExifDate("2026-09-14T06:41:32+02:00"),
    ).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("2026-09-14")).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("2026:13:14 06:41:32")).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("2026:09:14 24:00:00")).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("0000:00:00 00:00:00")).toBeUndefined();
    expect(getLocalDateTimeFromExifDate("    :  :     :  :  ")).toBeUndefined();
  });
});

describe("getOffsetMinutesFromExifOffset", () => {
  it("reads east as positive and west as negative", () => {
    expect(getOffsetMinutesFromExifOffset("+02:00")).toBe(120);
    expect(getOffsetMinutesFromExifOffset("-05:30")).toBe(-330);
    expect(getOffsetMinutesFromExifOffset("+00:00")).toBe(0);
  });

  it("refuses an offset no clock on Earth uses", () => {
    expect(getOffsetMinutesFromExifOffset("+15:00")).toBeUndefined();
    expect(getOffsetMinutesFromExifOffset("+02:75")).toBeUndefined();
    expect(getOffsetMinutesFromExifOffset("Z")).toBeUndefined();
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
