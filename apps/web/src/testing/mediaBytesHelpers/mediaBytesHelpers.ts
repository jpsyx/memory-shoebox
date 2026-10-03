import {
  makeBytesFromUint32,
  makeBytesFromUint64,
} from "./mediaIntegerBytesHelpers";
import type {
  IfdEntryOptions,
  JpegExifFields,
  MovieHeaderFields,
  TrackHeaderFields,
} from "./mediaBytesHelpers.types";

import { makeAtomBytesFromTypeAndBody } from "./mediaAtomBytesHelpers";

/**
 * Byte-exact media headers, built in code so the upload tests need no binary
 * fixture in the repository.
 *
 * Each builder writes only what the code under test reads: an EXIF block in a
 * JPEG's APP1 segment, and the atom tree around a QuickTime `mvhd`. Neither
 * produces anything a decoder would draw, which is the point: the header
 * readers decode nothing either.
 */

/** Seconds from the QuickTime epoch (1904-01-01) to the Unix epoch. */
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;

/** A big-endian unsigned 16-bit value. */
function _u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

/** A NUL-terminated ASCII string, the form EXIF stores text in. */
function _ascii(text: string): number[] {
  return [...new TextEncoder().encode(text), 0];
}

/** One 12-byte IFD entry. `value` is the inline value or an offset. */
function _ifdEntry(options: IfdEntryOptions): number[] {
  return [
    ..._u16(options.tag),
    ..._u16(options.type),
    ...makeBytesFromUint32(options.count),
    ...options.value,
  ];
}

/** The two ASCII tags the Exif sub-IFD may carry, as bytes. */
function _buildExifTexts(
  fields: Readonly<JpegExifFields>,
): Array<{ tag: number; bytes: number[] }> {
  return [
    { tag: 0x9003, text: fields.dateTimeOriginal },
    { tag: 0x9011, text: fields.offsetTimeOriginal },
  ].flatMap((entry) => {
    return entry.text === undefined
      ? []
      : [{ tag: entry.tag, bytes: _ascii(entry.text) }];
  });
}

/** The Exif sub-IFD: its entries, then the text they point at. */
function _buildExifIfd(options: {
  fields: Readonly<JpegExifFields>;
  ifdOffset: number;
}): number[] {
  const texts = _buildExifTexts(options.fields);
  const sizes = [
    { tag: 0xa002, size: options.fields.pixelWidth },
    { tag: 0xa003, size: options.fields.pixelHeight },
  ].flatMap((entry) => {
    return entry.size === undefined
      ? []
      : [
          _ifdEntry({
            tag: entry.tag,
            type: 4,
            count: 1,
            value: makeBytesFromUint32(entry.size),
          }),
        ];
  });
  const entryCount = texts.length + sizes.length;
  const dataStart = options.ifdOffset + 2 + entryCount * 12 + 4;
  const textEntries = texts.map((text, index) => {
    const offset = texts.slice(0, index).reduce((sum, earlier) => {
      return sum + earlier.bytes.length;
    }, dataStart);
    return _ifdEntry({
      tag: text.tag,
      type: 2,
      count: text.bytes.length,
      value: makeBytesFromUint32(offset),
    });
  });
  return [
    ..._u16(entryCount),
    ...[...textEntries, ...sizes].flat(),
    ...makeBytesFromUint32(0),
    ...texts.flatMap((text) => {
      return text.bytes;
    }),
  ];
}

/**
 * The TIFF block an EXIF segment holds, whatever file wraps it.
 *
 * Big-endian ("MM"), with IFD0 holding the orientation and a pointer to the
 * Exif sub-IFD that holds the date, its offset and the pixel dimensions. Its
 * offsets count from its own first byte, so a JPEG and a HEIC can carry it
 * unchanged.
 */
function _buildTiffBytes(fields: Readonly<JpegExifFields>): number[] {
  const ifd0Entries =
    fields.orientation === undefined
      ? []
      : [
          _ifdEntry({
            tag: 0x0112,
            type: 3,
            count: 1,
            value: [..._u16(fields.orientation), 0, 0],
          }),
        ];
  const exifIfdOffset = 8 + 2 + (ifd0Entries.length + 1) * 12 + 4;
  return [
    ...[0x4d, 0x4d, 0x00, 0x2a],
    ...makeBytesFromUint32(8),
    ..._u16(ifd0Entries.length + 1),
    ...ifd0Entries.flat(),
    ..._ifdEntry({
      tag: 0x8769,
      type: 4,
      count: 1,
      value: makeBytesFromUint32(exifIfdOffset),
    }),
    ...makeBytesFromUint32(0),
    ..._buildExifIfd({ fields, ifdOffset: exifIfdOffset }),
  ];
}

/**
 * A JPEG that is only a start marker, an APP1 EXIF segment and an end marker.
 *
 * Pass `undefined` for a JPEG with no APP1 segment at all.
 */
export function makeJpegBytesFromExif(
  fields: Readonly<JpegExifFields> | undefined,
): Uint8Array<ArrayBuffer> {
  if (fields === undefined) {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }
  const app1 = [..._ascii("Exif"), 0, ..._buildTiffBytes(fields)];
  return new Uint8Array([
    ...[0xff, 0xd8, 0xff, 0xe1],
    ..._u16(app1.length + 2),
    ...app1,
    ...[0xff, 0xd9],
  ]);
}

/** The four ASCII characters of a box type or a brand, with no terminator. */
function _fourCc(code: string): number[] {
  return [...new TextEncoder().encode(code)];
}

/** The item id the test HEIC gives its one Exif item. */
const HEIC_EXIF_ITEM_ID = 1;

/** The `meta` box that locates the Exif item at one offset and length. */
function _buildHeicMetaBytes(options: {
  exifOffset: number;
  exifLength: number;
}): number[] {
  const infe = makeAtomBytesFromTypeAndBody({
    type: "infe",
    body: [
      ...[2, 0, 0, 0],
      ..._u16(HEIC_EXIF_ITEM_ID),
      ..._u16(0),
      ..._fourCc("Exif"),
      0,
    ],
  });
  const iinf = makeAtomBytesFromTypeAndBody({
    type: "iinf",
    body: [0, 0, 0, 0, ..._u16(1), ...infe],
  });
  const iloc = makeAtomBytesFromTypeAndBody({
    type: "iloc",
    body: [
      ...[0, 0, 0, 0],
      // 4-byte offsets and lengths, no base offset, no extent index.
      ...[0x44, 0x00],
      ..._u16(1),
      ..._u16(HEIC_EXIF_ITEM_ID),
      ..._u16(0),
      ..._u16(1),
      ...makeBytesFromUint32(options.exifOffset),
      ...makeBytesFromUint32(options.exifLength),
    ],
  });
  return makeAtomBytesFromTypeAndBody({
    type: "meta",
    body: [0, 0, 0, 0, ...iinf, ...iloc],
  });
}

/**
 * A HEIC that is only a `ftyp`, a `meta` box locating one Exif item, and an
 * `mdat` holding it, so the EXIF reader can be run over the same container an
 * iPhone writes.
 *
 * `compatibleBrands` sets the `ftyp` length: `heic` alone is 20 bytes, and the
 * newest iPhones write nine brands for 52. The item's offset counts from the
 * start of the file, which is why a rewrite of the `ftyp` has to keep its
 * length.
 */
export function makeHeicBytesFromExif(
  options: Readonly<{
    fields: Readonly<JpegExifFields>;
    compatibleBrands: readonly string[];
  }>,
): Uint8Array<ArrayBuffer> {
  const ftyp = makeAtomBytesFromTypeAndBody({
    type: "ftyp",
    body: [
      ..._fourCc("heic"),
      ...[0, 0, 0, 0],
      ...options.compatibleBrands.flatMap(_fourCc),
    ],
  });
  // The item starts with the distance to its TIFF header: zero, it follows.
  const item = [...makeBytesFromUint32(0), ..._buildTiffBytes(options.fields)];
  const metaLength = _buildHeicMetaBytes({
    exifOffset: 0,
    exifLength: 0,
  }).length;
  const meta = _buildHeicMetaBytes({
    exifOffset: ftyp.length + metaLength + 8,
    exifLength: item.length,
  });
  return new Uint8Array([
    ...ftyp,
    ...meta,
    ...makeAtomBytesFromTypeAndBody({ type: "mdat", body: item }),
  ]);
}

/**
 * A PNG that is only a signature, an `IHDR` and an `IEND`: the header a
 * screenshot keeps its size in. The CRCs are zero, because the reader under
 * test checks none and no decoder ever sees this.
 */
export function makePngBytesFromSize(
  options: Readonly<{
    width: number;
    height: number;
  }>,
): Uint8Array<ArrayBuffer> {
  const header = [
    ...makeBytesFromUint32(options.width),
    ...makeBytesFromUint32(options.height),
    ...[8, 6, 0, 0, 0],
  ];
  return new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...makeBytesFromUint32(header.length),
    ..._fourCc("IHDR"),
    ...header,
    ...makeBytesFromUint32(0),
    ...makeBytesFromUint32(0),
    ..._fourCc("IEND"),
    ...makeBytesFromUint32(0),
  ]);
}

/** A complete 100- or 112-byte `mvhd` atom, padded as a real one is. */
export function makeMvhdAtomBytesFromFields(
  fields: Readonly<MovieHeaderFields>,
): number[] {
  const createdSeconds =
    Math.floor(fields.createdAt.getTime() / 1000) +
    QUICKTIME_EPOCH_OFFSET_SECONDS;
  const times =
    fields.version === 1
      ? [
          ...makeBytesFromUint64(BigInt(createdSeconds)),
          ...makeBytesFromUint64(BigInt(createdSeconds)),
          ...makeBytesFromUint32(fields.timescale),
          ...makeBytesFromUint64(BigInt(fields.duration)),
        ]
      : [
          ...makeBytesFromUint32(createdSeconds),
          ...makeBytesFromUint32(createdSeconds),
          ...makeBytesFromUint32(fields.timescale),
          ...makeBytesFromUint32(fields.duration),
        ];
  // Rate, volume, reserved, matrix, pre-defined and next track id: 80 bytes
  // the reader never looks at, written as zeros so the atom has its real size.
  return makeAtomBytesFromTypeAndBody({
    type: "mvhd",
    body: [
      ...[fields.version, 0, 0, 0],
      ...times,
      ...new Array<number>(80).fill(0),
    ],
  });
}

/** The nine matrix values for each number of quarter turns. */
const TURN_MATRICES: ReadonlyArray<readonly number[]> = [
  [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000],
  [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000],
  [-0x10000, 0, 0, 0, -0x10000, 0, 0, 0, 0x40000000],
  [0, -0x10000, 0, 0x10000, 0, 0, 0, 0, 0x40000000],
] as const;

/** A complete 92- or 104-byte `tkhd` atom. An audio track is 0 x 0. */
export function makeTkhdAtomBytesFromFields(
  fields: Readonly<TrackHeaderFields>,
): number[] {
  const times =
    fields.version === 1
      ? [
          ...makeBytesFromUint64(0n),
          ...makeBytesFromUint64(0n),
          ...makeBytesFromUint32(1),
          ...makeBytesFromUint32(0),
          ...makeBytesFromUint64(600n),
        ]
      : [
          ...makeBytesFromUint32(0),
          ...makeBytesFromUint32(0),
          ...makeBytesFromUint32(1),
          ...makeBytesFromUint32(0),
          ...makeBytesFromUint32(600),
        ];
  // Reserved, layer, alternate group, volume, reserved: 16 bytes of zeros.
  return makeAtomBytesFromTypeAndBody({
    type: "tkhd",
    body: [
      ...[fields.version, 0, 0, 7],
      ...times,
      ...new Array<number>(16).fill(0),
      ...(TURN_MATRICES[fields.quarterTurns] ?? []).flatMap(
        makeBytesFromUint32,
      ),
      ...makeBytesFromUint32(fields.width * 0x10000),
      ...makeBytesFromUint32(fields.height * 0x10000),
    ],
  });
}
