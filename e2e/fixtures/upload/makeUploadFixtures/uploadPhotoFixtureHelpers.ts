import { spawnSync } from "node:child_process";

import { readFileSync, writeFileSync } from "node:fs";

import { join } from "node:path";

import type {
  MakeIfdEntryFromFieldOptions,
  ExifTags,
} from "./makeUploadFixtures.types.ts";

import { FIXTURE_DIRECTORY } from "./makeUploadFixtures.constants.ts";

/** Runs one tool, and stops the whole script loudly if it fails. */
export function run(
  functionOptions: Readonly<{ command: string; args: readonly string[] }>,
): void {
  const { command, args } = functionOptions;

  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed. This needs magick, ffmpeg and sips: see the comment at the top of this file.`,
    );
  }
}

/** One 12-byte IFD entry, big-endian, its value or offset left-justified. */
function _makeIfdEntryFromField(options: MakeIfdEntryFromFieldOptions): Buffer {
  const entry = Buffer.alloc(12);
  entry.writeUInt16BE(options.tag, 0);
  entry.writeUInt16BE(options.type, 2);
  entry.writeUInt32BE(options.count, 4);
  options.value.copy(entry, 8);
  return entry;
}

/** A four-byte IFD value: a 16-bit SHORT or a 32-bit LONG, left-justified. */
function _makeIfdValueFromNumber(options: {
  value: number;
  bytes: 2 | 4;
}): Buffer {
  const value = Buffer.alloc(4);
  if (options.bytes === 2) {
    value.writeUInt16BE(options.value, 0);
  } else {
    value.writeUInt32BE(options.value, 0);
  }
  return value;
}

/** Where each string starts, counting on from `firstOffset`. */
export function getOffsetsFromStrings(
  options: Readonly<{
    strings: readonly Buffer[];
    firstOffset: number;
  }>,
): number[] {
  return options.strings.reduce<number[]>((offsets, _value, index) => {
    const previousOffset = offsets[index - 1];
    const previousLength = options.strings[index - 1]?.length ?? 0;
    return [
      ...offsets,
      previousOffset === undefined
        ? options.firstOffset
        : previousOffset + previousLength,
    ];
  }, []);
}

/** IFD0: Orientation, then the pointer to the Exif IFD. */
function _makeIfd0FromTags(options: {
  orientation: number;
  exifIfdOffset: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x02]),
    _makeIfdEntryFromField({
      tag: 0x0112,
      type: 3,
      count: 1,
      value: _makeIfdValueFromNumber({ value: options.orientation, bytes: 2 }),
    }),
    _makeIfdEntryFromField({
      tag: 0x8769,
      type: 4,
      count: 1,
      value: _makeIfdValueFromNumber({
        value: options.exifIfdOffset,
        bytes: 4,
      }),
    }),
    Buffer.alloc(4),
  ]);
}

/** The Exif IFD: DateTimeOriginal, then OffsetTimeOriginal if there is one. */
function _makeExifIfdFromStrings(options: {
  strings: readonly Buffer[];
  offsets: readonly number[];
}): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, options.strings.length]),
    ...options.strings.map((value, index) => {
      return _makeIfdEntryFromField({
        tag: index === 0 ? 0x9003 : 0x9011,
        type: 2,
        count: value.length,
        value: _makeIfdValueFromNumber({
          value: options.offsets[index] ?? 0,
          bytes: 4,
        }),
      });
    }),
    Buffer.alloc(4),
  ]);
}

/**
 * Returns a big-endian JPEG APP1 segment containing IFD0 and an Exif IFD.
 * Entries follow ascending TIFF tag order.
 */
function _makeExifSegmentFromTags(tags: Readonly<ExifTags>): Buffer {
  // Offsets count from the TIFF header after Exif\0\0: IFD0 starts at 8,
  // followed
  // by the Exif IFD and its strings.

  const strings = [tags.dateTimeOriginal, tags.offsetTimeOriginal]
    .filter((value): value is string => {
      return value !== undefined;
    })
    .map((value) => {
      return Buffer.from(`${value}\0`, "latin1");
    });
  const exifIfdOffset = 8 + 2 + 2 * 12 + 4;
  const offsets = getOffsetsFromStrings({
    strings,
    firstOffset: exifIfdOffset + 2 + strings.length * 12 + 4,
  });
  const tiff = Buffer.concat([
    Buffer.from("MM\0*", "latin1"),
    _makeIfdValueFromNumber({ value: 8, bytes: 4 }),
    _makeIfd0FromTags({ orientation: tags.orientation, exifIfdOffset }),
    _makeExifIfdFromStrings({ strings, offsets }),
    ...strings,
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), length, payload]);
}

/** Copies a JPEG with the EXIF segment written straight after its SOI. */
function _writeJpegWithExif(options: {
  sourcePath: string;
  targetPath: string;
  tags: Readonly<ExifTags>;
}): void {
  const jpeg = readFileSync(options.sourcePath);
  writeFileSync(
    options.targetPath,
    Buffer.concat([
      jpeg.subarray(0, 2),
      _makeExifSegmentFromTags(options.tags),
      jpeg.subarray(2),
    ]),
  );
}

/**
 * An upright portrait picture stored on its side, the way a phone stores one.
 *
 * Drawn upright at 1800x2400 with a red band across the top, then turned a
 * quarter counter-clockwise into 2400x1800 pixels. Orientation 6 turns it
 * back, so a viewer that honours the tag shows the band at the top and one
 * that ignores it shows the band down the left.
 */
function _writeSidewaysPortrait(targetPath: string): void {
  run({
    command: "magick",
    args: [
      "-size",
      "1800x2400",
      "xc:#e8dcc4",
      "-fill",
      "#c0392b",
      "-draw",
      "rectangle 0,0 1799,340",
      "-fill",
      "#2c3e50",
      "-draw",
      "polygon 900,490 560,1120 1240,1120",
      "-fill",
      "#27ae60",
      "-draw",
      "circle 900,1760 900,1500",
      "-rotate",
      "-90",
      "-strip",
      "-quality",
      "80",
      targetPath,
    ],
  });
}

/**
 * A landscape picture with no metadata at all, as a messaging app saves one.
 */
function _writeForwardedJpeg(targetPath: string): void {
  run({
    command: "magick",
    args: [
      "-size",
      "2560x1920",
      "xc:#d5e8d4",
      "-fill",
      "#8e44ad",
      "-draw",
      "rectangle 0,0 2559,280",
      "-fill",
      "#e67e22",
      "-draw",
      "circle 1280,1120 1280,720",
      "-strip",
      "-quality",
      "80",
      targetPath,
    ],
  });
}

/** The two rotated photographs and the forwarded one. */
export function writePhotoFixtures(scratch: string): void {
  const sideways = join(scratch, "sideways.jpg");
  _writeSidewaysPortrait(sideways);
  _writeJpegWithExif({
    sourcePath: sideways,
    targetPath: join(FIXTURE_DIRECTORY, "portrait-orientation-6.jpg"),
    tags: {
      orientation: 6,
      dateTimeOriginal: "2026:05:01 12:41:32",
      offsetTimeOriginal: "+02:00",
    },
  });
  const heicSource = join(scratch, "heic-source.jpg");
  _writeJpegWithExif({
    sourcePath: sideways,
    targetPath: heicSource,
    tags: {
      orientation: 6,
      dateTimeOriginal: "2026:05:02 12:10:05",
      offsetTimeOriginal: undefined,
    },
  });
  // ImageIO keeps the EXIF and writes orientation 6 as `irot` as well, as a
  // phone's own encoder does. Quality 40 keeps it a few kilobytes.
  run({
    command: "sips",
    args: [
      "-s",
      "format",
      "heic",
      "-s",
      "formatOptions",
      "40",
      heicSource,
      "--out",
      join(FIXTURE_DIRECTORY, "heic-rotated.heic"),
    ],
  });
  _writeForwardedJpeg(join(FIXTURE_DIRECTORY, "IMG-20260503-WA0001.jpg"));
}
