import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { appConfig } from "../../../../app.config.ts";
import {
  createMediaRangeReader,
  type MediaRangeReader,
} from "./input/createMediaRangeReader.ts";
import type { MediaProcessRunner } from "./runtime/createMediaProcessRunner.ts";
import { probeMedia } from "./runtime/probeMedia.ts";
import { getMediaAdmissionFromProbe } from "./runtime/getMediaAdmissionFromProbe.ts";
import { makePhotoRenditionsFromSource } from "./recipes/makePhotoRenditionsFromSource.ts";
import { makeVideoRenditionsFromSource } from "./recipes/makeVideoRenditionsFromSource.ts";
import type { MediaProcessingSourceOptions } from "./mediaProcessing.types.ts";

import type { MediaProbe } from "./runtime/mediaRuntime.types.ts";

type SourceOptions = MediaProcessingSourceOptions & {
  runner: MediaProcessRunner;
};

async function _settle(
  reader: MediaRangeReader,
  signal: AbortSignal,
): Promise<void> {
  await reader.awaitIdle(
    AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  );
  const failure = reader.getFailure();
  if (failure !== undefined) {
    throw new Error(`processing_${failure}`);
  }
}

async function _savePhoto(
  options: Readonly<SourceOptions>,
  reader: MediaRangeReader,
  signal: AbortSignal,
): Promise<string> {
  const path = join(options.runner.scratchPath, "source-image");
  const response = await fetch(reader.url, { signal, redirect: "error" });
  if (response.status !== 200 || response.body === null) {
    await response.body?.cancel();
    throw new Error("processing_upstream_unavailable");
  }
  await pipeline(
    Readable.from(response.body),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
    { signal },
  );
  if ((await stat(path)).size !== options.source.byteSize) {
    throw new Error("processing_source_truncated");
  }
  return path;
}

async function _process(
  options: Readonly<SourceOptions>,
  reader: MediaRangeReader,
): Promise<void> {
  const probe = await probeMedia({
    inputUrl: reader.url,
    runner: options.runner,
    signal: options.signal,
  });
  await _settle(reader, options.signal);
  const admission = getMediaAdmissionFromProbe({
    probe,
    sourceBytes: options.source.byteSize,
  });
  if (!admission.admitted) {
    throw new Error(admission.reason!);
  }
  if (probe.kind !== options.source.kind) {
    throw new Error("processing_source_kind_changed");
  }
  reader.setPhaseByteLimit(undefined);
  await _runBoundedRecipe(options, reader, probe);
}

async function _runRecipe(
  options: Readonly<SourceOptions>,
  reader: MediaRangeReader,
  probe: MediaProbe,
  signal: AbortSignal,
): Promise<void> {
  const sourcePathOrUrl =
    probe.kind === "photo"
      ? await _savePhoto(options, reader, signal)
      : reader.url;
  const input = {
    sourcePathOrUrl,
    sourceBytes: options.source.byteSize,
    probe,
    runner: options.runner,
    scratchDirectory: options.runner.scratchPath,
    signal,
  };
  const outputs = await (probe.kind === "photo"
    ? makePhotoRenditionsFromSource(input)
    : makeVideoRenditionsFromSource(input));
  await _settle(reader, signal);
  signal.throwIfAborted();
  await options.publish(outputs);
}

async function _runBoundedRecipe(
  options: Readonly<SourceOptions>,
  reader: MediaRangeReader,
  probe: MediaProbe,
): Promise<void> {
  const deadline = AbortSignal.timeout(
    probe.kind === "photo"
      ? appConfig.mediaProcessing.photoTimeoutMs
      : appConfig.mediaProcessing.videoTimeoutMs,
  );
  const signal = AbortSignal.any([options.signal, deadline]);
  try {
    await _runRecipe(options, reader, probe, signal);
  } catch (error) {
    if (deadline.aborted && !options.signal.aborted) {
      throw new Error(`processing_${probe.kind}_timeout`);
    }
    throw error;
  }
}

/** Retains the same meter across phases and drains reader and runner on every exit. */
export async function processMediaSource(
  options: Readonly<SourceOptions>,
): Promise<void> {
  let reader: MediaRangeReader | undefined;
  let failure: { error: unknown } | undefined;
  try {
    reader = await createMediaRangeReader({
      b2: options.b2,
      key: options.source.key,
      sourceBytes: options.source.byteSize,
      signal: options.signal,
      phaseByteLimit: appConfig.mediaProcessing.probeInputBytes,
    });
    try {
      await _process(options, reader);
    } catch (error) {
      // Child exit can precede upstream failure delivery; inspect after settlement.
      await _settle(reader, options.signal);
      throw error;
    }
  } catch (error) {
    failure = { error };
  }
  const results = await Promise.allSettled([
    reader?.close(),
    options.runner.dispose(),
  ]);
  if (failure !== undefined) {
    throw failure.error;
  }
  const failed = results.find((result) => {
    return result.status === "rejected";
  });
  if (failed?.status === "rejected") {
    throw new Error("processing_cleanup_failed", { cause: failed.reason });
  }
}
