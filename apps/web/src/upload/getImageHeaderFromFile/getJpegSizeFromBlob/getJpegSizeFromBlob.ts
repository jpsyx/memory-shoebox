type JpegSize = { width: number; height: number };

/** Bound work and header reads even when a malformed file never reaches a frame. */
const MAX_HEADER_MARKERS = 256;
/** JPEG frame markers, excluding Huffman tables, extensions and arithmetic tables. */
const FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function _getSizeFromFrame(header: DataView): JpegSize | undefined {
  if (header.byteLength < 10) {
    return undefined;
  }
  const components = header.getUint8(9);
  const height = header.getUint16(5);
  const width = header.getUint16(7);
  return components > 0 &&
    header.getUint16(2) >= 8 + 3 * components &&
    width > 0 &&
    height > 0
    ? { width, height }
    : undefined;
}

function _getSizeOrOffsetFromHeader(
  options: Readonly<{ header: DataView; offset: number; fileSize: number }>,
): JpegSize | number | undefined {
  const { header, offset, fileSize } = options;
  if (header.byteLength < 2 || header.getUint8(0) !== 0xff) {
    return undefined;
  }
  const marker = header.getUint8(1);
  if (marker === 0xff || marker === 0x01) {
    return offset + (marker === 0xff ? 1 : 2);
  }
  if (
    marker < 0xc0 ||
    (marker >= 0xd0 && marker <= 0xda) ||
    header.byteLength < 4
  ) {
    return undefined;
  }
  const length = header.getUint16(2);
  if (length < 2 || offset + 2 + length > fileSize) {
    return undefined;
  }
  if (FRAME_MARKERS.has(marker)) {
    return _getSizeFromFrame(header);
  }
  return offset + 2 + length;
}

async function _getSizeFromMarker(
  options: Readonly<{ file: Blob; offset: number; remainingMarkers: number }>,
): Promise<JpegSize | undefined> {
  const { file, offset, remainingMarkers } = options;
  if (remainingMarkers === 0) {
    return undefined;
  }
  const header = new DataView(
    await file.slice(offset, offset + 12).arrayBuffer(),
  );
  const sizeOrOffset = _getSizeOrOffsetFromHeader({
    header,
    offset,
    fileSize: file.size,
  });
  return typeof sizeOrOffset === "number"
    ? _getSizeFromMarker({
        file,
        offset: sizeOrOffset,
        remainingMarkers: remainingMarkers - 1,
      })
    : sizeOrOffset;
}

/**
 * Reads encoded JPEG dimensions without decoding pixels or loading segment
 * payloads. At most 256 twelve-byte marker headers are read; scan data is never
 * searched. EXIF orientation is applied separately by the image-header reader.
 */
export async function getJpegSizeFromBlob(
  file: Blob,
): Promise<JpegSize | undefined> {
  try {
    const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return signature[0] === 0xff && signature[1] === 0xd8
      ? await _getSizeFromMarker({
          file,
          offset: 2,
          remainingMarkers: MAX_HEADER_MARKERS,
        })
      : undefined;
  } catch {
    return undefined;
  }
}
