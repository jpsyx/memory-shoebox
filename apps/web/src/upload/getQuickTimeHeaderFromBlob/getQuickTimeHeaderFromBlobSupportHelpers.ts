import type {
  AtomPosition,
  AtomRange,
} from "./getQuickTimeHeaderFromBlob.types";

import { getDisplaySizeFromTkhdBody } from "./getDisplaySizeFromTkhdBody";

import {
  MAX_ATOMS_PER_LEVEL,
  TKHD_BODY_BYTES,
} from "./getQuickTimeHeaderFromBlob.constants";

/**
 * Where an atom's space ends: its declared size, but never past the file.
 *
 * A truncated file can have an atom that claims more than the file holds, and
 * a walk that trusted the claim would read past the end.
 */
export function getAtomEnd(
  options: Readonly<{
    blob: Blob;
    atom: AtomPosition;
  }>,
): number {
  return Math.min(options.atom.start + options.atom.size, options.blob.size);
}

/** One slice of the file, as bytes. */
async function _readBytes(range: Readonly<AtomRange>): Promise<Uint8Array> {
  const slice = range.blob.slice(range.start, range.end);
  return new Uint8Array(await slice.arrayBuffer());
}

/**
 * The size and header length of the atom at `start`, or undefined if malformed.
 */
function _getAtomSizeFromHeader(options: {
  header: Uint8Array;
  start: number;
  end: number;
}): { size: number; headerBytes: number } | undefined {
  const { header } = options;
  if (header.byteLength < 8) {
    return undefined;
  }
  const view = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  const size32 = view.getUint32(0);
  if (size32 === 1) {
    if (header.byteLength < 16) {
      return undefined;
    }
    // A size smaller than its own 16-byte header could not move the walk on.
    const size64 = Number(view.getBigUint64(8));
    return size64 < 16 ? undefined : { size: size64, headerBytes: 16 };
  }
  // Zero means "to the end of the enclosing space", which only the last
  // atom of a file or a box may say.
  const size = size32 === 0 ? options.end - options.start : size32;
  return size < 8 ? undefined : { size, headerBytes: 8 };
}

/**
 * The first atom of `type` in the range, stepping over siblings by their
 * declared sizes without reading their bodies.
 */
export async function findAtom(
  range: Readonly<AtomRange & { type: string; atomsLeft?: number }>,
): Promise<AtomPosition | undefined> {
  const { atomsLeft = MAX_ATOMS_PER_LEVEL } = range;

  if (atomsLeft === 0 || range.start + 8 > range.end) {
    return undefined;
  }
  const header = await _readBytes({
    ...range,
    end: Math.min(range.start + 16, range.end),
  });
  const sized = _getAtomSizeFromHeader({ header, ...range });
  if (sized === undefined) {
    return undefined;
  }
  const type = new TextDecoder("latin1").decode(header.subarray(4, 8));
  if (type === range.type) {
    return { start: range.start, ...sized };
  }
  return findAtom({
    ...range,
    start: range.start + sized.size,
    atomsLeft: atomsLeft - 1,
  });
}

/** The body of the first `type` atom in the range, at most `bytes` of it. */
export async function readChildBody(
  range: Readonly<AtomRange & { type: string; bytes: number }>,
): Promise<Uint8Array | undefined> {
  const atom = await findAtom(range);
  if (atom === undefined) {
    return undefined;
  }
  const start = atom.start + atom.headerBytes;
  return _readBytes({
    blob: range.blob,
    start,
    end: Math.min(start + range.bytes, getAtomEnd({ blob: range.blob, atom })),
  });
}

/** The first track, from `start` on, that has a displayed size. */
export async function findVideoTrackSize(
  range: Readonly<AtomRange>,
): Promise<{ width: number; height: number } | undefined> {
  const trak = await findAtom({ ...range, type: "trak" });
  if (trak === undefined) {
    return undefined;
  }
  const tkhd = await readChildBody({
    blob: range.blob,
    start: trak.start + trak.headerBytes,
    end: getAtomEnd({ blob: range.blob, atom: trak }),
    type: "tkhd",
    bytes: TKHD_BODY_BYTES,
  });
  const size =
    tkhd === undefined ? undefined : getDisplaySizeFromTkhdBody(tkhd);
  return (
    size ?? findVideoTrackSize({ ...range, start: trak.start + trak.size })
  );
}
