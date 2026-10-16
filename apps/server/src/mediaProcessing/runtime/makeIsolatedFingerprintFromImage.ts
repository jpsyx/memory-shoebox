import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath as fileUrlToPath } from "node:url";
import { visualFingerprintSchema } from "@memory-shoebox/shared";
import type { MediaProcessRunner } from "./createMediaProcessRunner.ts";

/** Runs the legacy fingerprint algorithm inside the mandatory job envelope. */
export async function makeIsolatedFingerprintFromImage(
  options: Readonly<{
    runner: MediaProcessRunner;
    bytes: Uint8Array;
    signal: AbortSignal;
  }>,
): Promise<string | undefined> {
  if (options.bytes.length > 20 * 1024 ** 2) {
    throw new Error("processing_fingerprint_input_limit");
  }
  const initialization = await options.runner.run({
    executable: "/bin/true",
    args: [],
    signal: options.signal,
    timeoutMs: 5000,
    stdoutLimitBytes: 0,
  });
  if (initialization.exitCode !== 0) {
    throw new Error("processing_fingerprint_failed");
  }
  const path = join(options.runner.scratchPath, "fingerprint-source");
  try {
    await writeFile(path, options.bytes, { flag: "wx", mode: 0o600 });
    const result = await options.runner.run({
      executable: process.execPath,
      args: [
        fileUrlToPath(new URL("./runFingerprintChild.ts", import.meta.url)),
        path,
      ],
      signal: options.signal,
      timeoutMs: 5000,
      stdoutLimitBytes: 2048,
    });
    if (result.exitCode !== 0) {
      throw new Error("processing_fingerprint_failed");
    }
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed === null ? undefined : visualFingerprintSchema.parse(parsed);
  } finally {
    await rm(path, { force: true });
  }
}
