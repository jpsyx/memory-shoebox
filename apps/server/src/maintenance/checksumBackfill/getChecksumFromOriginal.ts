import { createHash } from "node:crypto";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

/** A complete original's digest, or a safe diagnostic without signed URLs. */
export type OriginalChecksumResult =
  | { checksum: string }
  | { problem: "download_failed" | "byte_size_mismatch" };

async function _getChecksumFromStream(
  options: Readonly<{
    body: NonNullable<Response["body"]>;
    expectedBytes: number;
  }>,
): Promise<OriginalChecksumResult> {
  const hash = createHash("sha256");
  let receivedBytes = 0;
  // Consume each chunk before reading another: memory never grows with media.
  for await (const chunk of options.body) {
    receivedBytes += chunk.byteLength;
    if (receivedBytes > options.expectedBytes) {
      return { problem: "byte_size_mismatch" };
    }
    hash.update(chunk);
  }
  return receivedBytes === options.expectedBytes
    ? { checksum: hash.digest("hex") }
    : { problem: "byte_size_mismatch" };
}

/** Streams one original into SHA-256 without retaining the file in memory. */
export async function getChecksumFromOriginal(
  options: Readonly<{
    b2: Pick<B2Client, "presignGet">;
    storageKey: string;
    expectedBytes: number;
  }>,
): Promise<OriginalChecksumResult> {
  try {
    const url = await options.b2.presignGet({
      key: options.storageKey,
      expiresInSeconds: 3600,
    });
    const response = await fetch(url, {
      headers: { "accept-encoding": "identity" },
      redirect: "error",
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const encoding = response.headers.get("content-encoding");
    if (
      response.status !== 200 ||
      !response.body ||
      (encoding && encoding !== "identity")
    ) {
      await response.body?.cancel();
      return { problem: "download_failed" };
    }
    return await _getChecksumFromStream({
      body: response.body,
      expectedBytes: options.expectedBytes,
    });
  } catch {
    return { problem: "download_failed" };
  }
}
