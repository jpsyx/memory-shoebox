import { checkMediaCodecs } from "./checkMediaCodecs.ts";
import { createMediaProcessRunner } from "./createMediaProcessRunner.ts";
import type { MediaRuntimeCapabilities } from "./mediaRuntime.types.ts";
type MediaRuntimeCapabilitiesOptions = {
  enabled: boolean;
  signal?: AbortSignal;
  cgroupRoot: string;
  scratchRoot: string;
  clock: () => number;
};

/**
 * Verifies prerequisites without starting the queue or affecting API health.
 */
export async function getMediaRuntimeCapabilities(
  options: Readonly<MediaRuntimeCapabilitiesOptions>,
): Promise<MediaRuntimeCapabilities> {
  if (!options.enabled) {
    return { available: false, reason: "processing_disabled" };
  }
  const runner = createMediaProcessRunner(options);
  try {
    await checkMediaCodecs({ runner: runner, signal: options.signal });
    await runner.dispose();
    return { available: true, reason: undefined };
  } catch (error) {
    const reason =
      error instanceof Error && /^processing_[a-z_]+$/.test(error.message)
        ? error.message
        : "processing_codecs_unavailable";
    await runner.dispose().catch(() => {
      return undefined;
    });
    return { available: false, reason };
  }
}
