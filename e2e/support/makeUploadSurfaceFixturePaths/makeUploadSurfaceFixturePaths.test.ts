import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { getImageHeaderFromFile } from "../../../apps/web/src/upload/getImageHeaderFromFile/getImageHeaderFromFile.ts";
import { getQuickTimeHeaderFromBlob } from "../../../apps/web/src/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob.ts";
import {
  MEDIA_FIXTURE_NAMES,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../uploadHarnessHelpers.ts";
import { makeUploadSurfaceFixturePaths } from "./makeUploadSurfaceFixturePaths.ts";

const directories: string[] = [];
afterEach(() => {
  directories.forEach((directory) => {
    return rmSync(directory, { recursive: true, force: true });
  });
  directories.length = 0;
});

test("264 mixed fixtures have distinct content hashes instead of deduplicating", () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  const paths = makeUploadSurfaceFixturePaths({ directory, count: 264 });
  const hashes = paths.map((path) => {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  });
  expect(paths).toHaveLength(264);
  expect(new Set(hashes).size).toBe(264);
  const repeatedPaths = makeUploadSurfaceFixturePaths({
    directory: join(directory, "another-case"),
    count: 264,
  });
  const repeatedHashes = repeatedPaths.map((path) => {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  });
  expect(new Set([...hashes, ...repeatedHashes]).size).toBe(528);
  expect(
    paths.some((path) => {
      return path.endsWith(".heic");
    }),
  ).toBe(true);
  expect(
    paths.some((path) => {
      return path.endsWith(".mov");
    }),
  ).toBe(true);
});

test("uniqueness segments preserve EXIF and QuickTime capture evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  const paths = makeUploadSurfaceFixturePaths({ directory, count: 5 });
  await Promise.all(
    paths.map(async (path, index) => {
      const source = readFileSync(
        join(UPLOAD_FIXTURE_DIRECTORY, MEDIA_FIXTURE_NAMES[index]!),
      );
      const generated = readFileSync(path);
      const reader = /\.(mp4|mov)$/.test(path)
        ? getQuickTimeHeaderFromBlob
        : getImageHeaderFromFile;
      const originalHeader = await reader(new Blob([source]));
      expect(await reader(new Blob([generated])), basename(path)).toEqual(
        originalHeader,
      );
      expect(generated.byteLength).toBeGreaterThan(source.byteLength);
    }),
  );
});
