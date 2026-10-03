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

/** A big-endian unsigned 32-bit value. */
function _u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

/** A big-endian unsigned 64-bit value. */
function _u64(value: bigint): number[] {
  return [..._u32(Number(value >> 32n)), ..._u32(Number(value & 0xffffffffn))];
}

/** A NUL-terminated ASCII string, the form EXIF stores text in. */
function _ascii(text: string): number[] {
  return [...new TextEncoder().encode(text), 0];
}

/** One 12-byte IFD entry. `value` is the inline value or an offset. */
function _ifdEntry(options: {
  tag: number;
  type: number;
  count: number;
  value: number[];
}): number[] {
  return [
    ..._u16(options.tag),
    ..._u16(options.type),
    ..._u32(options.count),
    ...options.value,
  ];
}

/** What a test JPEG's EXIF block says. Omit a field to leave its tag out. */
export type JpegExifFields = {
  orientation?: number;
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  pixelWidth?: number;
  pixelHeight?: number;
};

/** One ASCII tag of the Exif sub-IFD, as the bytes it points at. */
type ExifText = { tag: number; bytes: number[] };

/** The two ASCII tags the Exif sub-IFD may carry, as bytes. */
function _buildExifTexts(fields: Readonly<JpegExifFields>): ExifText[] {
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
            value: _u32(entry.size),
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
      value: _u32(offset),
    });
  });
  return [
    ..._u16(entryCount),
    ...[...textEntries, ...sizes].flat(),
    ..._u32(0),
    ...texts.flatMap((text) => {
      return text.bytes;
    }),
  ];
}

/**
 * A JPEG that is only a start marker, an APP1 EXIF segment and an end marker.
 *
 * The TIFF block is big-endian ("MM"), with IFD0 holding the orientation and
 * a pointer to the Exif sub-IFD that holds the date, its offset and the pixel
 * dimensions. Pass `undefined` for a JPEG with no APP1 segment at all.
 */
export function makeJpegBytesFromExif(
  fields: Readonly<JpegExifFields> | undefined,
): Uint8Array<ArrayBuffer> {
  if (fields === undefined) {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }
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
  const tiff = [
    ...[0x4d, 0x4d, 0x00, 0x2a],
    ..._u32(8),
    ..._u16(ifd0Entries.length + 1),
    ...ifd0Entries.flat(),
    ..._ifdEntry({
      tag: 0x8769,
      type: 4,
      count: 1,
      value: _u32(exifIfdOffset),
    }),
    ..._u32(0),
    ..._buildExifIfd({ fields, ifdOffset: exifIfdOffset }),
  ];
  const app1 = [..._ascii("Exif"), 0, ...tiff];
  return new Uint8Array([
    ...[0xff, 0xd8, 0xff, 0xe1],
    ..._u16(app1.length + 2),
    ...app1,
    ...[0xff, 0xd9],
  ]);
}

/** One ISO-BMFF atom: a 32-bit size, a four-character type, the body. */
export function makeAtomBytes(type: string, body: readonly number[]): number[] {
  return [..._u32(body.length + 8), ...new TextEncoder().encode(type), ...body];
}

/**
 * An atom with a 64-bit "largesize", the form a 4 GB `mdat` takes.
 *
 * The 32-bit size field holds 1, and the real size follows the type.
 */
export function makeLargeAtomBytes(
  type: string,
  body: readonly number[],
): number[] {
  return [
    ..._u32(1),
    ...new TextEncoder().encode(type),
    ..._u64(BigInt(body.length + 16)),
    ...body,
  ];
}

/** What a test `mvhd` says, before it is written as version 0 or 1. */
export type MovieHeaderFields = {
  version: 0 | 1;
  /** The instant the movie was created, in UTC. */
  createdAt: Date;
  timescale: number;
  duration: number;
};

/** A complete 100- or 112-byte `mvhd` atom, padded as a real one is. */
export function makeMvhdAtomBytes(
  fields: Readonly<MovieHeaderFields>,
): number[] {
  const createdSeconds =
    Math.floor(fields.createdAt.getTime() / 1000) +
    QUICKTIME_EPOCH_OFFSET_SECONDS;
  const times =
    fields.version === 1
      ? [
          ..._u64(BigInt(createdSeconds)),
          ..._u64(BigInt(createdSeconds)),
          ..._u32(fields.timescale),
          ..._u64(BigInt(fields.duration)),
        ]
      : [
          ..._u32(createdSeconds),
          ..._u32(createdSeconds),
          ..._u32(fields.timescale),
          ..._u32(fields.duration),
        ];
  // Rate, volume, reserved, matrix, pre-defined and next track id: 80 bytes
  // the reader never looks at, written as zeros so the atom has its real size.
  return makeAtomBytes("mvhd", [
    ...[fields.version, 0, 0, 0],
    ...times,
    ...new Array<number>(80).fill(0),
  ]);
}

/** What a test `tkhd` says, before it is written as version 0 or 1. */
export type TrackHeaderFields = {
  version: 0 | 1;
  /** The stored pixels, before the matrix turns them. */
  width: number;
  height: number;
  /** Quarter turns the matrix applies: a phone's portrait video is 1. */
  quarterTurns: 0 | 1 | 2 | 3;
};

/** The nine matrix values for each number of quarter turns. */
const TURN_MATRICES: ReadonlyArray<readonly number[]> = [
  [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000],
  [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000],
  [-0x10000, 0, 0, 0, -0x10000, 0, 0, 0, 0x40000000],
  [0, -0x10000, 0, 0x10000, 0, 0, 0, 0, 0x40000000],
];

/** A complete 92- or 104-byte `tkhd` atom. An audio track is 0 x 0. */
export function makeTkhdAtomBytes(
  fields: Readonly<TrackHeaderFields>,
): number[] {
  const times =
    fields.version === 1
      ? [..._u64(0n), ..._u64(0n), ..._u32(1), ..._u32(0), ..._u64(600n)]
      : [..._u32(0), ..._u32(0), ..._u32(1), ..._u32(0), ..._u32(600)];
  // Reserved, layer, alternate group, volume, reserved: 16 bytes of zeros.
  return makeAtomBytes("tkhd", [
    ...[fields.version, 0, 0, 7],
    ...times,
    ...new Array<number>(16).fill(0),
    ...(TURN_MATRICES[fields.quarterTurns] ?? []).flatMap(_u32),
    ..._u32(fields.width * 0x10000),
    ..._u32(fields.height * 0x10000),
  ]);
}
