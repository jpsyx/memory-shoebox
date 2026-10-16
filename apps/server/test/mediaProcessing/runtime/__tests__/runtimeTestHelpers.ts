import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

/**
 * Registers per-test cleanup and returns the runtime scratch directory factory.
 */
export function installRuntimeScratchFixture(): () => Promise<string> {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((path) => {
        return rm(path, { recursive: true, force: true });
      }),
    );
  });
  async function _makeScratch(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "media-runtime-test-"));
    directories.push(path);
    return path;
  }
  return _makeScratch;
}
