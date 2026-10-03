import {
  makeBytesFromUint32,
  makeBytesFromUint64,
} from "./mediaIntegerBytesHelpers";

/** One ISO-BMFF atom: a 32-bit size, a four-character type, the body. */
export function makeAtomBytesFromTypeAndBody(
  functionOptions: Readonly<{ type: string; body: readonly number[] }>,
): number[] {
  const { type, body } = functionOptions;

  return [
    ...makeBytesFromUint32(body.length + 8),
    ...new TextEncoder().encode(type),
    ...body,
  ];
}

/**
 * An atom with a 64-bit "largesize", the form a 4 GB `mdat` takes.
 *
 * The 32-bit size field holds 1, and the real size follows the type.
 */
export function makeLargeAtomBytesFromTypeAndBody(
  functionOptions: Readonly<{ type: string; body: readonly number[] }>,
): number[] {
  const { type, body } = functionOptions;

  return [
    ...makeBytesFromUint32(1),
    ...new TextEncoder().encode(type),
    ...makeBytesFromUint64(BigInt(body.length + 16)),
    ...body,
  ];
}
