import type { PhotoSource } from "./visualFingerprintCatalog.ts";
import type {
  FingerprintReadResult,
  VisualFingerprintBackfillOptions,
} from "./visualFingerprintBackfill.types.ts";

/** A source cannot allocate more than this much compressed image memory. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

async function _readBytes(
  options: Readonly<{
    body: NonNullable<Response["body"]>;
    expectedBytes: number;
  }>,
): Promise<Uint8Array | undefined> {
  const reader = options.body.getReader();
  const bytes = new Uint8Array(options.expectedBytes);
  const readChunk = async (offset: number): Promise<Uint8Array | undefined> => {
    const chunk = await reader.read();
    if (chunk.done) {
      return offset === bytes.length ? bytes : undefined;
    }
    if (offset + chunk.value.length > bytes.length) {
      return undefined;
    }
    bytes.set(chunk.value, offset);
    return readChunk(offset + chunk.value.length);
  };
  try {
    return await readChunk(0);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function _decodeBytes(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    bytes: Uint8Array;
  }>,
): Promise<FingerprintReadResult> {
  try {
    return {
      fingerprint: await options.dependencies.makeFingerprint!(options.bytes),
    };
  } catch {
    return { problem: "decode_failed" };
  }
}

async function _fetchRendition(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    rendition: PhotoSource["renditions"][number];
  }>,
): Promise<Response> {
  const { dependencies, rendition } = options;
  const url = await dependencies.b2.presignGet({
    key: rendition.storage_key,
    expiresInSeconds: 60,
  });
  const timeout = AbortSignal.timeout(10_000);
  return (dependencies.fetch ?? fetch)(url, {
    headers: { "accept-encoding": "identity" },
    redirect: "error",
    signal: dependencies.signal
      ? AbortSignal.any([dependencies.signal, timeout])
      : timeout,
  });
}

async function _readRendition(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    rendition: PhotoSource["renditions"][number];
  }>,
): Promise<FingerprintReadResult> {
  const { dependencies, rendition } = options;
  if (rendition.byte_size > MAX_SOURCE_BYTES) {
    return { problem: "source_too_large" };
  }
  try {
    const response = await _fetchRendition(options);
    const encoding = response.headers.get("content-encoding");
    if (
      response.status !== 200 ||
      !response.body ||
      (encoding && encoding !== "identity")
    ) {
      await response.body?.cancel();
      return { problem: "download_failed" };
    }
    const bytes = await _readBytes({
      body: response.body,
      expectedBytes: rendition.byte_size,
    });
    if (!bytes) {
      return { problem: "byte_size_mismatch" };
    }
    if (dependencies.signal?.aborted) {
      return { problem: "download_failed" };
    }
    return await _decodeBytes({ dependencies, bytes });
  } catch {
    return { problem: "download_failed" };
  }
}

/** Tries the smallest stored representation before larger fallbacks. */
export async function getFingerprintFromPhotoSource(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    source: PhotoSource;
  }>,
): Promise<FingerprintReadResult> {
  const readPurpose = async (
    purposes: readonly string[],
  ): Promise<FingerprintReadResult> => {
    const purpose = purposes[0];
    if (!purpose || options.dependencies.signal?.aborted) {
      return { problem: "missing_source" };
    }
    const rendition = options.source.renditions.find((candidate) => {
      return candidate.purpose === purpose;
    });
    if (!rendition) {
      return readPurpose(purposes.slice(1));
    }
    const result = await _readRendition({
      dependencies: options.dependencies,
      rendition,
    });
    if ("fingerprint" in result || purposes.length === 1) {
      return result;
    }
    return readPurpose(purposes.slice(1));
  };
  return readPurpose(["thumb", "display", "original"]);
}
