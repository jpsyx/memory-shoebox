import { spawnSync } from "node:child_process";
import { createHash, randomUUID as randomUuid } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEDIA_FIXTURE_NAMES,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../uploadHarnessHelpers.ts";
import { makeExifCompatibleHeicFromBytes } from "./makeExifCompatibleHeicFromBytes/makeExifCompatibleHeicFromBytes.ts";

/** Distinct image pixels preserve the real visual-duplicate policy. */
function _writeDistinctPhoto(
  options: Readonly<{
    sourcePath: string;
    targetPath: string;
    seed: string;
    isPortrait: boolean;
  }>,
): void {
  const width = options.isPortrait ? 360 : 480;
  const height = options.isPortrait ? 480 : 360;
  const drawing = Array.from({ length: 64 }, (_, index) => {
    const color = createHash("sha256")
      .update(`${options.seed}:${index}`)
      .digest();
    const x = ((index % 8) * width) / 8;
    const y = (Math.floor(index / 8) * height) / 8;
    return `fill 'rgb(${color[0]},${color[1]},${color[2]})' rectangle ${x},${y} ${x + width / 8},${y + height / 8}`;
  }).join(" ");
  const isHeic = options.targetPath.endsWith(".heic");
  const result = spawnSync(
    "magick",
    [
      options.sourcePath,
      "-auto-orient",
      "-resize",
      `${width}x${height}!`,
      "-draw",
      drawing,
      "-quality",
      "80",
      options.targetPath,
    ],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Distinct surface photos need ImageMagick with HEIC: ${result.stderr || result.error}`,
    );
  }
  if (isHeic) {
    writeFileSync(
      options.targetPath,
      makeExifCompatibleHeicFromBytes(readFileSync(options.targetPath)),
    );
  }
}

/** ISO-BMFF markers make original video bytes unique without changing playback. */
function _makeDistinctVideoBytes(source: Buffer, marker: Buffer): Buffer {
  const freeHeader = Buffer.alloc(8);
  freeHeader.writeUInt32BE(marker.length + 8);
  freeHeader.write("free", 4, "latin1");
  return Buffer.concat([source, freeHeader, marker]);
}

/** Writes a mixed media batch under the test's own output directory. */
export function makeUploadSurfaceFixturePaths(
  options: Readonly<{
    directory: string;
    fileCount: number;
    sourceNames?: ReadonlyArray<(typeof MEDIA_FIXTURE_NAMES)[number]>;
  }>,
): string[] {
  const sourceNames = options.sourceNames ?? MEDIA_FIXTURE_NAMES;
  if (sourceNames.length === 0) {
    throw new Error("Surface fixture sources must not be empty");
  }
  mkdirSync(options.directory, { recursive: true });
  const batchId = randomUuid();
  const paths = Array.from({ length: options.fileCount }, (_, index) => {
    const name = sourceNames[index % sourceNames.length]!;
    const path = join(
      options.directory,
      name.replace(/(\.[^.]+)$/, `-${index}$1`),
    );
    const sourcePath = join(UPLOAD_FIXTURE_DIRECTORY, name);
    const seed = `upload-surface:${batchId}:${index}`;
    if (name.endsWith(".jpg") || name.endsWith(".heic")) {
      _writeDistinctPhoto({
        sourcePath,
        targetPath: path,
        seed,
        isPortrait: !name.startsWith("IMG-"),
      });
    } else {
      writeFileSync(
        path,
        _makeDistinctVideoBytes(readFileSync(sourcePath), Buffer.from(seed)),
      );
    }
    return path;
  });
  writeFileSync(
    join(options.directory, "fixture-manifest.json"),
    JSON.stringify(
      {
        batchId,
        files: paths.map((path) => {
          return {
            path,
            sha256: createHash("sha256")
              .update(readFileSync(path))
              .digest("hex"),
          };
        }),
      },
      null,
      2,
    ),
  );
  return paths;
}
