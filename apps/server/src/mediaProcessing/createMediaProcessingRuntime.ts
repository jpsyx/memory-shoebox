import type { Config } from "../configHelpers.ts";
import { getMediaRuntimeCapabilities } from "./runtime/getMediaRuntimeCapabilities.ts";
import { createMediaProcessRunner } from "./runtime/createMediaProcessRunner.ts";
import { makeIsolatedFingerprintFromImage } from "./runtime/makeIsolatedFingerprintFromImage.ts";
import { processMediaSource } from "./processMediaSource.ts";
import type { MediaProcessingRuntime } from "./mediaProcessing.types.ts";
import type { MediaRuntimeCapabilities } from "./runtime/mediaRuntime.types.ts";

/** Lazy production runtime; no decoder can bypass mandatory OS admission. */
export function createMediaProcessingRuntime(
  config: Readonly<Config["mediaProcessing"]>,
): MediaProcessingRuntime {
  const options = {
    ...config,
    clock: () => {
      return performance.now();
    },
  };
  let capabilities: MediaRuntimeCapabilities | undefined;
  return {
    getCapabilities: async (signal) => {
      signal.throwIfAborted();
      if (capabilities !== undefined) {
        return capabilities;
      }
      const result = await getMediaRuntimeCapabilities({ ...options, signal });
      signal.throwIfAborted();
      capabilities = result;
      return result;
    },
    processSource: (input) => {
      return processMediaSource({
        ...input,
        runner: createMediaProcessRunner(options),
      });
    },
    makeFingerprint: async ({ bytes, signal }) => {
      const runner = createMediaProcessRunner(options);
      try {
        return await makeIsolatedFingerprintFromImage({
          bytes,
          signal,
          runner,
        });
      } finally {
        await runner.dispose();
      }
    },
  };
}
