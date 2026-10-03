/** A big-endian unsigned 32-bit value. */
export function makeBytesFromUint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

/** A big-endian unsigned 64-bit value. */
export function makeBytesFromUint64(value: bigint): number[] {
  return [
    ...makeBytesFromUint32(Number(value >> 32n)),
    ...makeBytesFromUint32(Number(value & 0xffffffffn)),
  ];
}
