/** Encodes an arbitrary cursor payload as base64url JSON for valid and malformed paging-contract cases. */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}
