/**
 * A key as the bucket stores it: under this instance's key prefix.
 *
 * The one place a key gains the prefix. Everything the rest of the server
 * calls a key stays without it, so the catalog never stores it and nothing
 * that parses or compares keys has to know it exists.
 */
export function makeBucketKeyFromKey(
  options: Readonly<{
    keyPrefix: string;
    key: string;
  }>,
): string {
  return `${options.keyPrefix}/${options.key}`;
}
