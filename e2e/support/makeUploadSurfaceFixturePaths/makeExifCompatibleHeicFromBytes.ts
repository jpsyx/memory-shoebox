type Cursor = { bytes: Buffer; position: number; end: number };

function _readNumber(cursor: Cursor, width: number): number {
  if (cursor.position + width > cursor.end || ![2, 4].includes(width)) {
    throw new Error("Unsupported generated HEIC offset field");
  }
  const value = cursor.bytes.readUIntBE(cursor.position, width);
  cursor.position += width;
  return value;
}

function _getBoxFromBytes(options: {
  bytes: Buffer;
  start: number;
  end: number;
  kind: string;
}): { start: number; end: number } {
  const { bytes, start, end, kind } = options;
  if (start + 8 > end) {
    throw new Error(`Generated HEIC lacks ${kind}`);
  }
  const size = bytes.readUInt32BE(start);
  if (size < 8 || start + size > end) {
    throw new Error("Unsupported generated HEIC box bounds");
  }
  return bytes.toString("latin1", start + 4, start + 8) === kind
    ? { start: start + 8, end: start + size }
    : _getBoxFromBytes({ ...options, start: start + size });
}

function _normalizeItemOffsets(cursor: Cursor): void {
  _readNumber(cursor, 2); // Item id.
  if (_readNumber(cursor, 2) !== 0) {
    throw new Error("External HEIC data references are unsupported");
  }
  const basePosition = cursor.position;
  const base = _readNumber(cursor, 4);
  const extentCount = _readNumber(cursor, 2);
  Array.from({ length: extentCount }).forEach(() => {
    const offsetPosition = cursor.position;
    const offset = _readNumber(cursor, 4);
    const length = _readNumber(cursor, 4);
    const absolute = base + offset;
    if (absolute > 0xffffffff || absolute + length > cursor.bytes.length) {
      throw new Error("Generated HEIC extent is outside its file");
    }
    cursor.bytes.writeUInt32BE(absolute, offsetPosition);
  });
  cursor.bytes.writeUInt32BE(0, basePosition);
}

/**
 * Uses equivalent absolute iloc offsets for exifr's limited HEIF reader.
 * Only our generated version-0, local-file, 32-bit layout is accepted.
 * All encoded image/EXIF payload bytes and their file locations stay intact.
 */
export function makeExifCompatibleHeicFromBytes(source: Buffer): Buffer {
  const bytes = Buffer.from(source);
  const meta = _getBoxFromBytes({
    bytes,
    start: 0,
    end: bytes.length,
    kind: "meta",
  });
  const location = _getBoxFromBytes({
    bytes,
    start: meta.start + 4,
    end: meta.end,
    kind: "iloc",
  });
  const cursor = { bytes, position: location.start, end: location.end };
  if (_readNumber(cursor, 4) !== 0 || _readNumber(cursor, 2) !== 0x4440) {
    throw new Error(
      "Unsupported generated HEIC iloc version, construction mode or field widths",
    );
  }
  const count = _readNumber(cursor, 2);
  Array.from({ length: count }).forEach(() => {
    return _normalizeItemOffsets(cursor);
  });
  if (cursor.position !== cursor.end) {
    throw new Error("Unsupported generated HEIC iloc trailing data");
  }
  return bytes;
}
