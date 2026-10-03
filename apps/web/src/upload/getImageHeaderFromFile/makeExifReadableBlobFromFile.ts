/**
 * exifr 7.1.3 refuses an HEIC whose `ftyp` box is over 50 bytes
 * (`src/file-parsers/heif.mjs`), and the newest iPhones write a 52-byte one
 * (`mif1 MiHB MiHA heix` after `heic`). That was 8 of the spike's 105.
 */
const EXIFR_MAX_FTYP_BYTES = 50;

/** No real `ftyp` is anywhere near this; past it, the file is not HEIF. */
const MAX_PLAUSIBLE_FTYP_BYTES = 1024;

/** Header, major brand, minor version and one compatible brand. */
const SHORT_FTYP_BYTES = 20;

/** The ASCII bytes of a four-character code. */
function _fourCc(code: string): Uint8Array {
  return new TextEncoder().encode(code);
}

/**
 * The same file, with a short `ftyp` exifr accepts, when it needs one.
 *
 * Rewritten to the same length: a 20-byte `ftyp` (the original major brand,
 * and `heic` as its one compatible brand) followed by a `free` box filling the
 * rest. Every later byte keeps its offset, which matters because the `iloc`
 * table that locates the EXIF block counts from the start of the file. The
 * result is a `Blob` of two parts, so nothing is copied but the header.
 *
 * @param file A picked image. Anything that is not HEIF comes back untouched.
 * @returns A blob exifr can read the same tags out of.
 */
export async function makeExifReadableBlobFromFile(file: Blob): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.byteLength < 12) {
    return file;
  }
  const ftypBytes = new DataView(head.buffer).getUint32(0);
  const isFtyp =
    new TextDecoder("latin1").decode(head.subarray(4, 8)) === "ftyp";
  if (
    !isFtyp ||
    ftypBytes <= EXIFR_MAX_FTYP_BYTES ||
    ftypBytes > MAX_PLAUSIBLE_FTYP_BYTES
  ) {
    return file;
  }
  const replacement = new Uint8Array(ftypBytes);
  const view = new DataView(replacement.buffer);
  view.setUint32(0, SHORT_FTYP_BYTES);
  replacement.set(_fourCc("ftyp"), 4);
  replacement.set(head.subarray(8, 12), 8);
  replacement.set(_fourCc("heic"), 16);
  view.setUint32(SHORT_FTYP_BYTES, ftypBytes - SHORT_FTYP_BYTES);
  replacement.set(_fourCc("free"), SHORT_FTYP_BYTES + 4);
  return new Blob([replacement, file.slice(ftypBytes)]);
}
