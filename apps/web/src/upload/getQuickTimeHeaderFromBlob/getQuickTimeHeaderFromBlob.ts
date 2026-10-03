/** Seconds from the QuickTime epoch (1904-01-01 UTC) to the Unix epoch. */
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;

/**
 * How many atoms one walk may step over before it gives up.
 *
 * A real movie has a handful at each level (`ftyp`, `wide`, `mdat`, `moov`,
 * perhaps `free`; `mvhd`, a few `trak`, `udta`), so this only ever bites on a
 * file that is not one, where it stops a garbage size field from turning into
 * thousands of tiny reads.
 */
const MAX_ATOMS_PER_LEVEL = 64;

/** The bytes of an `mvhd` body this reads: version 1 is the longer one. */
const MVHD_BODY_BYTES = 32;

/** The bytes of a `tkhd` body this reads: version 1 is the longer one. */
const TKHD_BODY_BYTES = 96;

/** What a QuickTime or MP4 header says: when, how long, and how big. */
export type QuickTimeHeader = {
  /** `mvhd` `creation_time`, UTC by specification, as ISO-8601. Not judged. */
  creationTime: string | null;
  durationMs: number | null;
  /** The first video track's displayed size, its rotation applied. */
  width: number | null;
  height: number | null;
};

/** Where one atom sits in the file. */
type AtomPosition = { start: number; headerBytes: number; size: number };

/** The part of the file one walk may look in. */
type AtomRange = { blob: Blob; start: number; end: number };

/** The ISO instant for a count of seconds since 1904, or null off the clock. */
function _makeInstantFromQuickTimeSeconds(seconds: number): string | null {
  const instant = new Date((seconds - QUICKTIME_EPOCH_OFFSET_SECONDS) * 1000);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Milliseconds from a duration in timescale units, or null when unknown. */
function _makeDurationMsFromUnits(options: {
  duration: number;
  timescale: number;
  unknownDuration: number;
}): number | null {
  if (options.timescale === 0 || options.duration === options.unknownDuration) {
    return null;
  }
  const durationMs = Math.round((options.duration / options.timescale) * 1000);
  return Number.isSafeInteger(durationMs) ? durationMs : null;
}

/**
 * Reads an `mvhd` body: the bytes after its atom header, version byte first.
 *
 * Version 0 stores both times and the duration in 32 bits, version 1 in 64.
 * The all-ones duration is the format's own "unknown", and reads as null.
 *
 * @param body At least 20 bytes for version 0, 32 for version 1.
 * @returns The times, or null when the body is too short to be a header.
 */
export function getMovieTimesFromMvhdBody(
  body: Uint8Array,
): Pick<QuickTimeHeader, "creationTime" | "durationMs"> | null {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (body.byteLength < 1) {
    return null;
  }
  const isVersion1 = view.getUint8(0) === 1;
  if (body.byteLength < (isVersion1 ? 32 : 20)) {
    return null;
  }
  const creationSeconds = isVersion1
    ? Number(view.getBigUint64(4))
    : view.getUint32(4);
  const timescale = view.getUint32(isVersion1 ? 20 : 12);
  const duration = isVersion1
    ? Number(view.getBigUint64(24))
    : view.getUint32(16);
  return {
    creationTime: _makeInstantFromQuickTimeSeconds(creationSeconds),
    durationMs: _makeDurationMsFromUnits({
      duration,
      timescale,
      unknownDuration: isVersion1 ? Number(0xffffffffffffffffn) : 0xffffffff,
    }),
  };
}

/**
 * Reads a `tkhd` body: the track's size, turned by its matrix.
 *
 * Width and height are 16.16 fixed point after the matrix, which sits 40
 * bytes in for version 0 and 52 for version 1. A phone records a portrait
 * video as landscape pixels with a quarter-turn matrix (`a` and `d` both
 * zero), so that turn swaps the two; a half turn leaves the box alone.
 *
 * @param body At least 84 bytes for version 0, 96 for version 1.
 * @returns The displayed size, or null for a track with none (audio).
 */
export function getDisplaySizeFromTkhdBody(
  body: Uint8Array,
): { width: number; height: number } | null {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const matrixAt = body.byteLength > 0 && view.getUint8(0) === 1 ? 52 : 40;
  const sizeAt = matrixAt + 36;
  if (body.byteLength < sizeAt + 8) {
    return null;
  }
  const width = Math.round(view.getUint32(sizeAt) / 0x10000);
  const height = Math.round(view.getUint32(sizeAt + 4) / 0x10000);
  if (width === 0 || height === 0) {
    return null;
  }
  const isQuarterTurn =
    view.getInt32(matrixAt) === 0 && view.getInt32(matrixAt + 16) === 0;
  return isQuarterTurn ? { width: height, height: width } : { width, height };
}

/** One slice of the file, as bytes. */
async function _readBytes(range: Readonly<AtomRange>): Promise<Uint8Array> {
  const slice = range.blob.slice(range.start, range.end);
  return new Uint8Array(await slice.arrayBuffer());
}

/** The size and header length of the atom at `start`, or null if malformed. */
function _getAtomSizeFromHeader(options: {
  header: Uint8Array;
  start: number;
  end: number;
}): { size: number; headerBytes: number } | null {
  const { header } = options;
  const view = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  const size32 = view.getUint32(0);
  if (size32 === 1) {
    return header.byteLength < 16
      ? null
      : { size: Number(view.getBigUint64(8)), headerBytes: 16 };
  }
  // Zero means "to the end of the enclosing space", which only the last
  // atom of a file or a box may say.
  const size = size32 === 0 ? options.end - options.start : size32;
  return size < 8 ? null : { size, headerBytes: 8 };
}

/**
 * The first atom of `type` in the range, stepping over siblings by their
 * declared sizes without reading their bodies.
 */
async function _findAtom(
  range: Readonly<AtomRange & { type: string; atomsLeft?: number }>,
): Promise<AtomPosition | null> {
  const atomsLeft = range.atomsLeft ?? MAX_ATOMS_PER_LEVEL;
  if (atomsLeft === 0 || range.start + 8 > range.end) {
    return null;
  }
  const header = await _readBytes({
    ...range,
    end: Math.min(range.start + 16, range.end),
  });
  const sized = _getAtomSizeFromHeader({ header, ...range });
  if (sized === null) {
    return null;
  }
  const type = new TextDecoder("latin1").decode(header.subarray(4, 8));
  if (type === range.type) {
    return { start: range.start, ...sized };
  }
  return _findAtom({
    ...range,
    start: range.start + sized.size,
    atomsLeft: atomsLeft - 1,
  });
}

/** The body of the first `type` atom in the range, at most `bytes` of it. */
async function _readChildBody(
  range: Readonly<AtomRange & { type: string; bytes: number }>,
): Promise<Uint8Array | null> {
  const atom = await _findAtom(range);
  if (atom === null) {
    return null;
  }
  const start = atom.start + atom.headerBytes;
  return _readBytes({
    blob: range.blob,
    start,
    end: Math.min(start + range.bytes, atom.start + atom.size),
  });
}

/** The first track, from `start` on, that has a displayed size. */
async function _findVideoTrackSize(
  range: Readonly<AtomRange>,
): Promise<{ width: number; height: number } | null> {
  const trak = await _findAtom({ ...range, type: "trak" });
  if (trak === null) {
    return null;
  }
  const tkhd = await _readChildBody({
    blob: range.blob,
    start: trak.start + trak.headerBytes,
    end: trak.start + trak.size,
    type: "tkhd",
    bytes: TKHD_BODY_BYTES,
  });
  const size = tkhd === null ? null : getDisplaySizeFromTkhdBody(tkhd);
  return (
    size ?? _findVideoTrackSize({ ...range, start: trak.start + trak.size })
  );
}

/** What a file with no readable `moov` answers. */
const NOTHING_FOUND: QuickTimeHeader = {
  creationTime: null,
  durationMs: null,
  width: null,
  height: null,
};

/**
 * When a QuickTime or MP4 movie was created, how long it runs, and the
 * displayed size of its first video track.
 *
 * Walks the top-level atoms to `moov`, wherever it is (a phone writes it after
 * the media data, at the end of the file), then reads `mvhd` and the first
 * `trak` whose `tkhd` has a size. Every read is a small `Blob.slice`, so a
 * 533 MB video costs a few kilobytes and nothing is decoded. The size is
 * what lets a video the browser cannot decode still complete: `complete`
 * needs dimensions, and they come from here when no poster could be drawn.
 *
 * The browser reports and never judges: a zero `creation_time` comes back as
 * the 1904 epoch itself, and rejecting it is the server's rung 2.
 *
 * @param blob The picked video file.
 * @returns The header, with nulls for whatever the file does not say.
 */
export async function getQuickTimeHeaderFromBlob(
  blob: Blob,
): Promise<QuickTimeHeader> {
  const moov = await _findAtom({
    blob,
    start: 0,
    end: blob.size,
    type: "moov",
  });
  if (moov === null) {
    return NOTHING_FOUND;
  }
  const inside = {
    blob,
    start: moov.start + moov.headerBytes,
    end: moov.start + moov.size,
  };
  const mvhd = await _readChildBody({
    ...inside,
    type: "mvhd",
    bytes: MVHD_BODY_BYTES,
  });
  const times = mvhd === null ? null : getMovieTimesFromMvhdBody(mvhd);
  const size = await _findVideoTrackSize(inside);
  return {
    creationTime: times?.creationTime ?? null,
    durationMs: times?.durationMs ?? null,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}
