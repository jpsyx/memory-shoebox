import { expect } from "@playwright/test";

import { appConfig } from "../../../app.config.ts";

import type { FakeS3Request } from "../createFakeS3Server/createFakeS3Server.types.ts";

import {
  readUploadSession,
  type UploadedFileRecord,
} from "../uploadCatalogHelpers.ts";

import {
  DUPLICATE_FIXTURE_NAME,
  getEventsFromState,
  MULTIPART_FIXTURE_NAME,
  REFUSED_FIXTURE_NAME,
  type UploadProofState,
} from "../uploadHarnessHelpers.ts";

import { H264_NAMES } from "./uploadExpectations.constants.ts";

import type { ExpectTheDuplicateSkippedOptions } from "./uploadExpectations.types.ts";

/**
 * Every file the first test sends, with where it must land.
 *
 * Each date is set at midday, in the file or in the name, so the day is the
 * same in every zone `shoebox.timezone` could plausibly hold: the zone
 * arithmetic is the ladder's unit tests' to prove, and this proves the ladder
 * is what decided. A video's `creation_time` is an instant (design decision
 * 14), so it keeps no offset, and its day is the one the zone gives 12:00 UTC.
 */
const EXPECTED_CAPTURE: Record<
  string,
  {
    capturedOn: string;
    captureSource: string;
    captureOffsetMinutes: number | undefined;
  }
> = {
  "portrait-orientation-6.jpg": {
    capturedOn: "2026-05-01",
    captureSource: "exif",
    captureOffsetMinutes: 120,
  },
  "heic-rotated.heic": {
    capturedOn: "2026-05-02",
    captureSource: "exif",
    captureOffsetMinutes: undefined,
  },
  "IMG-20260503-WA0001.jpg": {
    capturedOn: "2026-05-03",
    captureSource: "filename",
    captureOffsetMinutes: undefined,
  },
  "h264-clip.mp4": {
    capturedOn: "2026-05-04",
    captureSource: "video_metadata",
    captureOffsetMinutes: undefined,
  },
  "hevc-clip.mov": {
    capturedOn: "2026-05-05",
    captureSource: "video_metadata",
    captureOffsetMinutes: undefined,
  },
  [MULTIPART_FIXTURE_NAME]: {
    capturedOn: "2026-05-04",
    captureSource: "video_metadata",
    captureOffsetMinutes: undefined,
  },
};

/** The two stored on their side, which must come out portrait. */
const ROTATED_NAMES = [
  "portrait-orientation-6.jpg",
  "heic-rotated.heic",
] as const;

/**
 * The record of one named file, or a failure naming it.
 *
 * @param files A batch's records.
 * @param name The original filename.
 * @returns That file's record.
 */
export function getFileFromFilesByName(
  functionOptions: Readonly<{
    files: readonly UploadedFileRecord[];
    name: string;
  }>,
): UploadedFileRecord {
  const { files, name } = functionOptions;

  const file = files.find((candidate) => {
    return candidate.originalFilename === name;
  });
  if (file === undefined) {
    throw new Error(`No manifest row for ${name}`);
  }
  return file;
}

/**
 * The PDF was refused at the manifest, never presigned, and never reached the
 * bucket, which is the contract's "nothing in the bucket for a refusal".
 *
 * @param options.proof The harness's record.
 * @param options.files The batch's records.
 * @param options.requests The stand-in's log.
 */
export function expectTheRefusal(
  options: Readonly<{
    proof: Readonly<UploadProofState>;
    files: readonly UploadedFileRecord[];
    requests: readonly FakeS3Request[];
  }>,
): void {
  const pdf = getFileFromFilesByName({
    files: options.files,
    name: REFUSED_FIXTURE_NAME,
  });
  expect(pdf).toMatchObject({
    state: "refused",
    problemCode: "unsupported_type",
    attemptCount: 0,
    storageKey: undefined,
    item: undefined,
  });
  const outcome = options.proof.outcomes.find((candidate) => {
    return candidate.fileId === pdf.fileId;
  });
  expect(outcome).toMatchObject({ disposition: "refused" });
  const pdfRequests = options.requests.filter((request) => {
    return request.key.includes(pdf.fileId);
  });
  expect(pdfRequests).toEqual([]);
}

/**
 * Every other file is done, on its day, by the rung that should decide it,
 * and the two stored on their side are items standing upright.
 *
 * @param files The batch's records.
 */
export function expectTheDays(files: readonly UploadedFileRecord[]): void {
  Object.entries(EXPECTED_CAPTURE).forEach(([name, expected]) => {
    const file = getFileFromFilesByName({ files: files, name: name });
    expect(file.state, name).toBe("done");
    expect(file.item, name).toMatchObject(expected);
  });
  ROTATED_NAMES.forEach((name) => {
    const item = getFileFromFilesByName({ files: files, name: name }).item;
    expect(item?.height ?? 0, `${name} is portrait`).toBeGreaterThan(
      item?.width ?? 0,
    );
  });
}

/** The long edge of one rendition, or 0 when there is none. */
function _getLongEdgeFromRendition(
  rendition: { width: number; height: number } | undefined,
): number {
  return Math.max(rendition?.width ?? 0, rendition?.height ?? 0);
}

/**
 * Both derivatives on every photograph, at the sizes `appConfig` names and
 * the right way up, and a poster on both H.264 clips.
 *
 * HEVC is asserted only to land: whether a headless browser draws a frame of
 * it depends on the machine's decoder, and a missing poster is decision 1's
 * fallback rather than a failure.
 *
 * @param files The batch's records.
 */
export function expectTheDerivatives(
  files: readonly UploadedFileRecord[],
): void {
  const { displayLongEdgePx, thumbLongEdgePx } = appConfig.upload.derivatives;
  (
    [
      "portrait-orientation-6.jpg",
      "heic-rotated.heic",
      "IMG-20260503-WA0001.jpg",
    ] as const
  ).forEach((name) => {
    const renditions =
      getFileFromFilesByName({ files: files, name: name }).item?.renditions ??
      [];
    const byPurpose = new Map(
      renditions.map((rendition) => {
        return [rendition.purpose, rendition];
      }),
    );
    expect([...byPurpose.keys()].sort(), name).toEqual([
      "display",
      "original",
      "thumb",
    ]);
    const display = byPurpose.get("display");
    expect(_getLongEdgeFromRendition(display), name).toBe(displayLongEdgePx);
    const thumb = byPurpose.get("thumb");
    expect(_getLongEdgeFromRendition(thumb), name).toBe(thumbLongEdgePx);
    if (
      ROTATED_NAMES.some((rotatedName) => {
        return rotatedName === name;
      })
    ) {
      expect(display?.height ?? 0, name).toBeGreaterThan(display?.width ?? 0);
    }
  });
  _expectThePosters(files);
}

/** A poster on both H.264 clips, which both engines decode. */
function _expectThePosters(files: readonly UploadedFileRecord[]): void {
  H264_NAMES.forEach((name) => {
    const renditions =
      getFileFromFilesByName({ files: files, name: name }).item?.renditions ??
      [];
    const purposes = renditions.map((rendition) => {
      return rendition.purpose;
    });
    expect(purposes, name).toEqual(
      expect.arrayContaining(["original", "poster"]),
    );
  });
}

/**
 * The copy was cancelled at presign and never reached the bucket, and the
 * engine said so with `file-skipped` and then read the batch for `settled`.
 *
 * The original's completion is the only one, and it did not settle the batch:
 * the copy's cancel did, in presign's own transaction (design decision 15).
 *
 * @param options.sessionId The batch.
 * @param options.proof The harness's record.
 * @param options.files The batch's records.
 * @param options.requests The stand-in's log.
 */
export async function expectTheDuplicateSkipped(
  options: Readonly<
    Omit<ExpectTheDuplicateSkippedOptions, "proof" | "files" | "requests">
  > &
    Readonly<{
      proof: Readonly<UploadProofState>;
      files: readonly UploadedFileRecord[];
      requests: readonly FakeS3Request[];
    }>,
): Promise<void> {
  const original = getFileFromFilesByName({
    files: options.files,
    name: "portrait-orientation-6.jpg",
  });
  const copy = getFileFromFilesByName({
    files: options.files,
    name: DUPLICATE_FIXTURE_NAME,
  });
  expect(original.state).toBe("done");
  expect(copy).toMatchObject({
    state: "cancelled",
    problemCode: undefined,
    item: undefined,
  });
  const copyRequests = options.requests.filter((request) => {
    return request.key.includes(copy.fileId);
  });
  expect(copyRequests).toEqual([]);
  const completions = getEventsFromState({
    state: options.proof,
    kind: "file-done",
  }).map((event) => {
    return [event.fileId, event.response.didSettle];
  });
  expect(completions).toEqual([[original.fileId, false]]);
  expect(options.proof.events.slice(-2)).toEqual([
    { kind: "file-skipped", fileId: copy.fileId, reason: "duplicate" },
    { kind: "settled", sessionState: "settled" },
  ]);
  expect(await readUploadSession(options.sessionId)).toMatchObject({
    state: "settled",
  });
}
