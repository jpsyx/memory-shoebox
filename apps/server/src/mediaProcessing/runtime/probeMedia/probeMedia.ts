import { open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_CONFIG } from "../../../../../../app.config.ts";
import type { MediaProcessRunner } from "../createMediaProcessRunner.ts";
import type { MediaProbe } from "../mediaRuntime.types.ts";
import {
  makeMediaArgumentsFromInput,
  getProbeFromFfprobe,
  getProbeFromHeifInfo,
} from "./probeMediaHelpers.ts";

const LIMITS = APP_CONFIG.mediaProcessing;
type ProbeOptions = {
  inputUrl: string;
  runner: MediaProcessRunner;
  signal: AbortSignal;
};

async function _fetchRange({
  options,
  start,
  end,
}: {
  options: Readonly<ProbeOptions>;
  start: number;
  end: number;
}): Promise<Response> {
  const response = await fetch(options.inputUrl, {
    headers: { Range: `bytes=${start}-${end}` },
    redirect: "error",
    signal: options.signal,
  });
  if (response.status !== 206 || response.body === null) {
    throw new Error("processing_probe_input_unavailable");
  }
  return response;
}

function _getFormat(header: Buffer): string {
  if (header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    return "jpeg_pipe";
  }
  if (
    header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "png_pipe";
  }
  if (
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp_pipe";
  }
  if (header.toString("ascii", 4, 8) === "ftyp") {
    const brand = header.toString("ascii", 8, 12);
    if (["heic", "heix", "mif1"].includes(brand)) {
      return "heic";
    }
    if (["isom", "iso2", "mp41", "mp42", "qt  ", "M4V "].includes(brand)) {
      return "mov";
    }
  }
  throw new Error("processing_format_unsupported");
}

async function _saveProbePrefix({
  options,
  header,
  sourceBytes,
}: {
  options: Readonly<ProbeOptions>;
  header: Buffer;
  sourceBytes: number;
}): Promise<string> {
  const path = join(options.runner.scratchPath, "probe-input");
  await writeFile(path, header, { flag: "wx" });
  const end = Math.min(sourceBytes, LIMITS.probeInputBytes) - 1;
  if (end < header.length) {
    return path;
  }
  const response = await _fetchRange({ options, start: header.length, end });
  const file = await open(path, "a");
  let bytes = header.length;
  try {
    for await (const chunk of response.body!) {
      bytes += chunk.length;
      if (bytes > LIMITS.probeInputBytes) {
        throw new Error("processing_probe_input_limit");
      }
      await file.writeFile(chunk);
    }
  } finally {
    await file.close();
  }
  return path;
}

async function _probeHeic({
  options,
  path,
}: {
  options: Readonly<ProbeOptions>;
  path: string;
}): Promise<MediaProbe> {
  const first = await options.runner.run({
    executable: "heif-info",
    args: [path],
    signal: options.signal,
    timeoutMs: LIMITS.probeTimeoutMs,
    stdoutLimitBytes: LIMITS.probeMetadataBytes,
  });
  if (first.exitCode !== 0) {
    throw new Error("processing_probe_invalid");
  }
  const boxes = await options.runner.run({
    executable: "heif-info",
    args: ["-d", path],
    signal: options.signal,
    timeoutMs: LIMITS.probeTimeoutMs,
    stdoutLimitBytes:
      LIMITS.probeMetadataBytes - Buffer.byteLength(first.stdout),
  });
  if (boxes.exitCode !== 0) {
    throw new Error("processing_probe_invalid");
  }
  return getProbeFromHeifInfo({ stdout: first.stdout, boxes: boxes.stdout });
}

async function _readHeader(response: Response): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body!) {
    bytes += chunk.length;
    if (bytes > 32) {
      throw new Error("processing_probe_input_limit");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function _checkImageChunks({
  path,
  format,
}: {
  path: string;
  format: string;
}): Promise<void> {
  if (!["png_pipe", "webp_pipe"].includes(format)) {
    return;
  }
  const file = await open(path, "r");
  const size = (await file.stat()).size;
  const inspect = async ({
    offset,
    remaining,
  }: {
    offset: number;
    remaining: number;
  }): Promise<void> => {
    if (offset >= size) {
      return;
    }
    const header = Buffer.alloc(12);
    const read = await file.read(header, 0, 12, offset);
    if (remaining === 0 || read.bytesRead < 12) {
      throw new Error("processing_probe_invalid");
    }
    const isPng = format === "png_pipe";
    const kind = header.toString("ascii", isPng ? 4 : 0, isPng ? 8 : 4);
    if (
      kind === "acTL" ||
      kind === "ANIM" ||
      (kind === "VP8X" && (header[8]! & 2) !== 0)
    ) {
      throw new Error("processing_photo_not_still");
    }
    if (isPng && kind === "IDAT") {
      return;
    }
    const length = isPng ? header.readUInt32BE(0) : header.readUInt32LE(4);
    const end = offset + length + (isPng ? 12 : 8 + (length % 2));
    if (end > size || end <= offset) {
      throw new Error("processing_probe_invalid");
    }
    await inspect({ offset: end, remaining: remaining - 1 });
  };
  try {
    await inspect({ offset: format === "png_pipe" ? 8 : 12, remaining: 4096 });
  } finally {
    await file.close();
  }
}

async function _probe(options: Readonly<ProbeOptions>): Promise<MediaProbe> {
  makeMediaArgumentsFromInput({ input: options.inputUrl, format: "mov" });
  await options.runner.run({
    executable: "/bin/true",
    args: [],
    signal: options.signal,
    timeoutMs: LIMITS.probeTimeoutMs,
    stdoutLimitBytes: 0,
  });
  const response = await _fetchRange({ options, start: 0, end: 31 });
  const header = await _readHeader(response);
  const sourceBytes = Number(
    /\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1],
  );
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < header.length) {
    throw new Error("processing_probe_invalid");
  }
  const format = _getFormat(header);
  const input =
    format === "mov"
      ? options.inputUrl
      : await _saveProbePrefix({ options, header, sourceBytes });
  if (format === "heic") {
    return _probeHeic({ options, path: input });
  }
  await _checkImageChunks({ path: input, format });
  return _probeFfprobe({ options, format, input });
}

async function _probeFfprobe({
  options,
  format,
  input,
}: {
  options: Readonly<ProbeOptions>;
  format: string;
  input: string;
}): Promise<MediaProbe> {
  const result = await options.runner.run({
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      ...makeMediaArgumentsFromInput({ format, input }),
      "-probesize",
      String(LIMITS.probeInputBytes),
      "-analyzeduration",
      "15000000",
      ...(format === "mov"
        ? []
        : ["-count_packets", "-read_intervals", "%+#2"]),
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      input,
    ],
    signal: options.signal,
    timeoutMs: LIMITS.probeTimeoutMs,
    stdoutLimitBytes: LIMITS.probeMetadataBytes,
  });
  if (result.exitCode !== 0) {
    throw new Error("processing_probe_invalid");
  }
  return getProbeFromFfprobe({
    stdout: result.stdout,
    kind: format === "mov" ? "video" : "photo",
  });
}

/**
 * Uses one reader's probe phase; caller checks its typed failure before
 * lifting.
 */
export async function probeMedia(
  options: Readonly<ProbeOptions>,
): Promise<MediaProbe> {
  const timeout = AbortSignal.timeout(LIMITS.probeTimeoutMs);
  try {
    return await _probe({
      ...options,
      signal: AbortSignal.any([options.signal, timeout]),
    });
  } catch (error) {
    if (options.signal.aborted) {
      throw new Error("processing_cancelled");
    }
    if (timeout.aborted) {
      throw new Error("processing_probe_timeout");
    }
    if (error instanceof Error && /^processing_[a-z_]+$/.test(error.message)) {
      throw error;
    }
    throw new Error("processing_probe_input_unavailable");
  }
}
