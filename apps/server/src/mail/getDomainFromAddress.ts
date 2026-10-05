/** Returns the normalized domain of an optional sender address. */
export function getDomainFromAddress(
  address: string | undefined,
): string | undefined {
  return address?.split("@").at(-1)?.toLowerCase();
}
