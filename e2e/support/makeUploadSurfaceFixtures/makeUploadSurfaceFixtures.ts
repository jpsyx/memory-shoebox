import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEDIA_FIXTURE_NAMES,
  UPLOAD_FIXTURE_DIRECTORY,
} from "../uploadHarnessHelpers.ts";

/** Writes a mixed media batch under the test's own output directory. */
export function makeUploadSurfaceFixturePaths(
  options: Readonly<{ directory: string; count: number }>,
): string[] {
  mkdirSync(options.directory, { recursive: true });
  const batchId = randomUUID();
  return Array.from({ length: options.count }, (_, index) => {
    const name = MEDIA_FIXTURE_NAMES[index % MEDIA_FIXTURE_NAMES.length]!;
    const path = join(
      options.directory,
      name.replace(/(\.[^.]+)$/, `-${index}$1`),
    );
    const source = readFileSync(join(UPLOAD_FIXTURE_DIRECTORY, name));
    const marker = Buffer.from(`upload-surface:${batchId}:${index}`);
    writeFileSync(
      path,
      _makeDistinctMediaBytes({
        source,
        marker,
        isJpeg: name.endsWith(".jpg"),
      }),
    );
    return path;
  });
}

/** JPEG COM and ISO-BMFF free boxes leave all capture and codec bytes intact. */
function _makeDistinctMediaBytes(
  options: Readonly<{ source: Buffer; marker: Buffer; isJpeg: boolean }>,
): Buffer {
  const { source, marker, isJpeg } = options;
  if (isJpeg) {
    const commentHeader = Buffer.from([0xff, 0xfe, 0, 0]);
    commentHeader.writeUInt16BE(marker.length + 2, 2);
    return Buffer.concat([
      source.subarray(0, 2),
      commentHeader,
      marker,
      source.subarray(2),
    ]);
  }
  const freeHeader = Buffer.alloc(8);
  freeHeader.writeUInt32BE(marker.length + 8);
  freeHeader.write("free", 4, "latin1");
  return Buffer.concat([source, freeHeader, marker]);
}
