import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HASH_CHUNK_BYTES,
  makeSha256HexFromBlob,
} from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";

/** Bytes that are not all one value, so a dropped or repeated slice shows. */
function _patternedBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(length).map((_unused, index) => {
    return (index * 31 + 7) & 0xff;
  });
}

/** What Node's own implementation says, as the reference. */
function _nodeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("makeSha256HexFromBlob", () => {
  it("hashes an empty blob to the empty digest", async () => {
    await expect(makeSha256HexFromBlob(new Blob([]))).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes abc to the FIPS 180-2 test vector", async () => {
    await expect(makeSha256HexFromBlob(new Blob(["abc"]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("agrees with Node on exactly one slice", async () => {
    const bytes = _patternedBytes(HASH_CHUNK_BYTES);

    await expect(makeSha256HexFromBlob(new Blob([bytes]))).resolves.toBe(
      _nodeSha256(bytes),
    );
  });

  it("agrees with Node on 20 MiB that end mid-slice", async () => {
    const bytes = _patternedBytes(20 * 1024 * 1024 + 7);

    await expect(makeSha256HexFromBlob(new Blob([bytes]))).resolves.toBe(
      _nodeSha256(bytes),
    );
  });
});
