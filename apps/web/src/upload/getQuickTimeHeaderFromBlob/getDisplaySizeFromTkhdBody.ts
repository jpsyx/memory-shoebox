/**
 * Returns a tkhd track's displayed dimensions, applying its rotation.
 *
 * Phone portrait video can use landscape pixels with a quarter-turn matrix;
 * this swaps width and height. A half-turn leaves the displayed box unchanged.
 *
 * @param body At least 84 bytes for version 0, 96 for version 1.
 * @returns Displayed size, or undefined for an audio/invalid track without a
 *   size.
 */
export function getDisplaySizeFromTkhdBody(
  body: Uint8Array,
): { width: number; height: number } | undefined {
  // Read 16.16 fixed-point dimensions after the matrix at byte 40 for version 0
  // or byte 52 for version 1.

  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const matrixAt = body.byteLength > 0 && view.getUint8(0) === 1 ? 52 : 40;
  const sizeAt = matrixAt + 36;
  if (body.byteLength < sizeAt + 8) {
    return undefined;
  }
  const width = Math.round(view.getUint32(sizeAt) / 0x10000);
  const height = Math.round(view.getUint32(sizeAt + 4) / 0x10000);
  if (width === 0 || height === 0) {
    return undefined;
  }
  const isQuarterTurn =
    view.getInt32(matrixAt) === 0 && view.getInt32(matrixAt + 16) === 0;
  return isQuarterTurn ? { width: height, height: width } : { width, height };
}
