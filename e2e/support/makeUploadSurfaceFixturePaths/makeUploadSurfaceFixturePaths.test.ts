import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getImageHeaderFromFile } from "../../../apps/web/src/upload/getImageHeaderFromFile/getImageHeaderFromFile.ts";
import { getQuickTimeHeaderFromBlob } from "../../../apps/web/src/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob.ts";
import {
  MEDIA_FIXTURE_NAMES,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../uploadHarnessHelpers.ts";
import { makeUploadSurfaceFixturePaths } from "./makeUploadSurfaceFixturePaths.ts";

vi.mock("node:child_process", () => {
  return { spawnSync: vi.fn() };
});
const drawings: string[] = [];
beforeEach(() => {
  drawings.length = 0;
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    const argumentsList = args as string[];
    const target = argumentsList.at(-1)!;
    const drawing = argumentsList[argumentsList.indexOf("-draw") + 1]!;
    drawings.push(drawing);
    const bytes = target.endsWith(".heic")
      ? readFileSync(new URL("./fixtures/libheif-offset.heic", import.meta.url))
      : readFileSync(argumentsList[0]!);
    // This stub proves invocation/identity contracts, never decoded uniqueness.
    writeFileSync(target, Buffer.concat([bytes, Buffer.from(drawing)]));
    return {
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null,
    };
  });
});
const directories: string[] = [];
afterEach(() => {
  directories.forEach((directory) => {
    return rmSync(directory, { recursive: true, force: true });
  });
  directories.length = 0;
});

test("two 264-file batches use distinct encoding drawings and stub-output identities", () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  const paths = makeUploadSurfaceFixturePaths({ directory, fileCount: 264 });
  const hashes = paths.map((path) => {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  });
  expect(paths).toHaveLength(264);
  expect(new Set(hashes).size).toBe(264);
  const repeatedPaths = makeUploadSurfaceFixturePaths({
    directory: join(directory, "another-case"),
    fileCount: 264,
  });
  const repeatedHashes = repeatedPaths.map((path) => {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  });
  expect(new Set([...hashes, ...repeatedHashes]).size).toBe(528);
  expect(drawings).toHaveLength(318);
  expect(new Set(drawings).size).toBe(318);
  const manifest = JSON.parse(
    readFileSync(join(directory, "fixture-manifest.json"), "utf8"),
  ) as { files: Array<{ path: string; sha256: string }> };
  expect(
    manifest.files.map((file) => {
      return file.path;
    }),
  ).toEqual(paths);
  expect(
    manifest.files.map((file) => {
      return file.sha256;
    }),
  ).toEqual(hashes);
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

test("encoding-boundary fixture payloads preserve EXIF and actual video markers preserve QuickTime evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  const paths = makeUploadSurfaceFixturePaths({ directory, fileCount: 5 });
  await Promise.all(
    paths.map(async (path, index) => {
      const source = readFileSync(
        join(UPLOAD_FIXTURE_DIRECTORY, MEDIA_FIXTURE_NAMES[index]!),
      );
      const generated = readFileSync(path);
      if (/\.(mp4|mov)$/.test(path)) {
        expect(
          await getQuickTimeHeaderFromBlob(new Blob([generated])),
          basename(path),
        ).toEqual(await getQuickTimeHeaderFromBlob(new Blob([source])));
      } else {
        const originalHeader = await getImageHeaderFromFile(new Blob([source]));
        const generatedHeader = await getImageHeaderFromFile(
          new Blob([generated]),
        );
        expect(generatedHeader.exifCapturedAtLocal, basename(path)).toBe(
          originalHeader.exifCapturedAtLocal,
        );
        expect(generatedHeader.exifOffsetMinutes, basename(path)).toBe(
          originalHeader.exifOffsetMinutes,
        );
      }
    }),
  );
});

test("reports an unavailable encoder instead of silently degrading fixtures", () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  vi.mocked(spawnSync).mockReturnValueOnce({
    pid: 0,
    output: [],
    stdout: "",
    stderr: "HEIC encoder unavailable",
    status: 1,
    signal: null,
  });
  expect(() => {
    return makeUploadSurfaceFixturePaths({ directory, fileCount: 1 });
  }).toThrow("ImageMagick with HEIC");
});

test("selected committed sources repeat in order with distinct encoder requests and matching metadata", async () => {
  const directory = mkdtempSync(join(tmpdir(), "upload-surface-"));
  directories.push(directory);
  const paths = makeUploadSurfaceFixturePaths({
    directory,
    fileCount: 3,
    sourceNames: ["portrait-orientation-6.jpg", "h264-clip.mp4"],
  });
  expect(
    paths.map((path) => {
      return basename(path);
    }),
  ).toEqual([
    "portrait-orientation-6-0.jpg",
    "h264-clip-1.mp4",
    "portrait-orientation-6-2.jpg",
  ]);
  expect(drawings).toHaveLength(2);
  expect(new Set(drawings).size).toBe(2);
  const original = await getImageHeaderFromFile(
    new Blob([
      readFileSync(
        join(UPLOAD_FIXTURE_DIRECTORY, "portrait-orientation-6.jpg"),
      ),
    ]),
  );
  for (const path of [paths[0]!, paths[2]!]) {
    expect(
      (await getImageHeaderFromFile(new Blob([readFileSync(path)])))
        .exifCapturedAtLocal,
    ).toBe(original.exifCapturedAtLocal);
  }
  expect(
    await getQuickTimeHeaderFromBlob(new Blob([readFileSync(paths[1]!)])),
  ).toEqual(
    await getQuickTimeHeaderFromBlob(
      new Blob([readFileSync(join(UPLOAD_FIXTURE_DIRECTORY, "h264-clip.mp4"))]),
    ),
  );
});
