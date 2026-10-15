import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { makeExifCompatibleHeicFromBytes } from "./makeExifCompatibleHeicFromBytes.ts";

const source = readFileSync(
  new URL("./fixtures/libheif-offset.heic", import.meta.url),
);
const exifr = createRequire(
  new URL("../../../apps/web/package.json", import.meta.url),
)("exifr") as {
  parse: (
    bytes: Buffer,
    options: object,
  ) => Promise<{ DateTimeOriginal?: string }>;
};

it("preserves encoded payloads while actual exifr reads the original HEIC date", async () => {
  const unmodified = await exifr.parse(source, { reviveValues: false });
  expect(unmodified.DateTimeOriginal).toBeUndefined();
  const normalized = makeExifCompatibleHeicFromBytes(source);
  expect(await exifr.parse(normalized, { reviveValues: false })).toMatchObject({
    DateTimeOriginal: "2026:05:02 12:10:05",
  });
  expect(normalized.length).toBe(source.length);
  const payload = source.indexOf(Buffer.from("mdat"));
  expect(payload).toBeGreaterThan(0);
  expect(normalized.subarray(payload)).toEqual(source.subarray(payload));
  expect(source).toEqual(
    readFileSync(new URL("./fixtures/libheif-offset.heic", import.meta.url)),
  );
});

it.each([
  [4, 0x01000000],
  [8, 0x88400004],
  [14, 1],
  [16, 0xfffffff0],
])(
  "refuses unsupported iloc fields before using them (%i)",
  (relative, value) => {
    const malformed = Buffer.from(source);
    const start = malformed.indexOf(Buffer.from("iloc"));
    if (relative === 14) malformed.writeUInt16BE(value, start + relative);
    else malformed.writeUInt32BE(value, start + relative);
    expect(() => {
      return makeExifCompatibleHeicFromBytes(malformed);
    }).toThrow(/HEIC/);
  },
);
