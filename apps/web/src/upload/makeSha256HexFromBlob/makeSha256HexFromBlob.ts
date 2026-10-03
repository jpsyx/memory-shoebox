import { createSHA256, type IHasher } from "hash-wasm";

/**
 * Eight MiB per read.
 *
 * The spike's figure: a one-shot digest of the 533 MB video cost twice its
 * size in memory, and streaming it in slices of this size cost 77 to 264 MB.
 * Large enough that the per-slice overhead is noise, small enough that two
 * workers hashing at once hold 16 MB of file between them.
 */
export const HASH_CHUNK_BYTES = 8 * 1024 * 1024;

/** Feeds the hasher every slice from `offset` to the end, one at a time. */
async function _updateFromOffset(options: {
  hasher: IHasher;
  blob: Blob;
  offset: number;
}): Promise<void> {
  if (options.offset >= options.blob.size) {
    return;
  }
  const slice = options.blob.slice(
    options.offset,
    options.offset + HASH_CHUNK_BYTES,
  );
  options.hasher.update(new Uint8Array(await slice.arrayBuffer()));
  await _updateFromOffset({
    ...options,
    offset: options.offset + HASH_CHUNK_BYTES,
  });
}

/**
 * The lowercase hex SHA-256 of a blob's bytes, read in slices.
 *
 * `contentHash` is what the hash negotiation matches on (`upload.md` § The
 * hash negotiation), so it must be the digest of exactly the bytes that will
 * be PUT. WebCrypto has no streaming digest, which is why this is `hash-wasm`:
 * memory stays at one slice whatever the file's size. A fresh hasher per
 * call, so two calls in one worker can never interleave their state.
 *
 * @param blob The file to hash. Read, never copied whole.
 * @returns 64 lowercase hex characters.
 */
export async function makeSha256HexFromBlob(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  await _updateFromOffset({ hasher, blob, offset: 0 });
  return hasher.digest("hex");
}
