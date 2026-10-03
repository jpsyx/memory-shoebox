import { expect, type Page } from "@playwright/test";
import { uploadSessionDetailSchema } from "@memory-shoebox/shared";
import { appConfig } from "../../app.config.ts";
import type { FakeS3Request } from "./fakeS3Server/fakeS3Server.ts";
import {
  getOriginalRequestsFromRequests,
  readEligibleRecipientAddresses,
  readUploadSession,
  readUploadSessionEmailAddresses,
  type UploadedFileRecord,
} from "./uploadCatalog.ts";
import {
  DUPLICATE_FIXTURE_NAME,
  FAMILY_EMAIL,
  getEventsFromState,
  MULTIPART_FIXTURE_NAME,
  REFUSED_FIXTURE_NAME,
  UPLOADER_EMAIL,
  type UploadProofState,
} from "./uploadHarness.ts";

/**
 * The upload spec's assertions, one function per claim, so each test reads as
 * the list of things it proves.
 */

/** Where one file must land, and how the ladder must say it decided. */
type ExpectedCapture = {
  capturedOn: string;
  captureSource: string;
  captureOffsetMinutes: number | null;
};

/**
 * Every file the first test sends, with where it must land.
 *
 * Each date is set at midday, in the file or in the name, so the day is the
 * same in every zone `shoebox.timezone` could plausibly hold: the zone
 * arithmetic is the ladder's unit tests' to prove, and this proves the ladder
 * is what decided. A video's `creation_time` is an instant (design decision
 * 14), so it keeps no offset, and its day is the one the zone gives 12:00 UTC.
 */
const EXPECTED_CAPTURE: Record<string, ExpectedCapture> = {
  "portrait-orientation-6.jpg": {
    capturedOn: "2026-05-01",
    captureSource: "exif",
    captureOffsetMinutes: 120,
  },
  "heic-rotated.heic": {
    capturedOn: "2026-05-02",
    captureSource: "exif",
    captureOffsetMinutes: null,
  },
  "IMG-20260503-WA0001.jpg": {
    capturedOn: "2026-05-03",
    captureSource: "filename",
    captureOffsetMinutes: null,
  },
  "h264-clip.mp4": {
    capturedOn: "2026-05-04",
    captureSource: "video_metadata",
    captureOffsetMinutes: null,
  },
  "hevc-clip.mov": {
    capturedOn: "2026-05-05",
    captureSource: "video_metadata",
    captureOffsetMinutes: null,
  },
  [MULTIPART_FIXTURE_NAME]: {
    capturedOn: "2026-05-04",
    captureSource: "video_metadata",
    captureOffsetMinutes: null,
  },
};

/** The photographs, which must each carry both derivatives. */
const PHOTO_NAMES = [
  "portrait-orientation-6.jpg",
  "heic-rotated.heic",
  "IMG-20260503-WA0001.jpg",
];

/** The two stored on their side, which must come out portrait. */
const ROTATED_NAMES = ["portrait-orientation-6.jpg", "heic-rotated.heic"];

/** The two H.264 clips, which both engines decode and so must give posters. */
const H264_NAMES = ["h264-clip.mp4", MULTIPART_FIXTURE_NAME];

/**
 * The record of one named file, or a failure naming it.
 *
 * @param files A batch's records.
 * @param name The original filename.
 * @returns That file's record.
 */
export function getFileByName(
  files: readonly UploadedFileRecord[],
  name: string,
): UploadedFileRecord {
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
export function expectTheRefusal(options: {
  proof: Readonly<UploadProofState>;
  files: readonly UploadedFileRecord[];
  requests: readonly FakeS3Request[];
}): void {
  const pdf = getFileByName(options.files, REFUSED_FIXTURE_NAME);
  expect(pdf).toMatchObject({
    state: "refused",
    problemCode: "unsupported_type",
    attemptCount: 0,
    storageKey: null,
    item: null,
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
    const file = getFileByName(files, name);
    expect(file.state, name).toBe("done");
    expect(file.item, name).toMatchObject(expected);
  });
  ROTATED_NAMES.forEach((name) => {
    const item = getFileByName(files, name).item;
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
  PHOTO_NAMES.forEach((name) => {
    const renditions = getFileByName(files, name).item?.renditions ?? [];
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
    if (ROTATED_NAMES.includes(name)) {
      expect(display?.height ?? 0, name).toBeGreaterThan(display?.width ?? 0);
    }
  });
  _expectThePosters(files);
}

/** A poster on both H.264 clips, which both engines decode. */
function _expectThePosters(files: readonly UploadedFileRecord[]): void {
  H264_NAMES.forEach((name) => {
    const renditions = getFileByName(files, name).item?.renditions ?? [];
    const purposes = renditions.map((rendition) => {
      return rendition.purpose;
    });
    expect(purposes, name).toEqual(
      expect.arrayContaining(["original", "poster"]),
    );
  });
}

/**
 * How far apart a poster's darkest and brightest pixel must be, out of 255.
 *
 * FFmpeg's test pattern spans most of the range; a uniform black or white
 * frame, which is what a poster drawn before the frame was ready looks like,
 * spans almost none.
 */
const MIN_POSTER_LUMINANCE_SPAN = 64;

/**
 * The span between a picture's darkest and brightest pixel, 0 to 255,
 * decoded by the browser under test.
 *
 * Decoded there because Node has no image decoder, and handed the bytes
 * rather than a URL so that no CORS rule of the stand-in's is part of the
 * check. Drawn at 64 px square first: the span of a test pattern survives the
 * downscale, and a uniform frame stays uniform.
 */
async function _getLuminanceSpanFromPicture(options: {
  page: Page;
  bytes: Buffer;
}): Promise<number> {
  return options.page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => {
      return character.charCodeAt(0);
    });
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("No 2D canvas to read the poster with");
    }
    context.drawImage(bitmap, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    const luminances = Array.from({ length: data.length / 4 }, (_, pixel) => {
      const [red = 0, green = 0, blue = 0] = data.subarray(
        pixel * 4,
        pixel * 4 + 3,
      );
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    });
    return Math.max(...luminances) - Math.min(...luminances);
  }, options.bytes.toString("base64"));
}

/**
 * Both H.264 posters are a frame of the clip, not a blank one.
 *
 * The engine skips a poster rather than store a black one, so a poster that
 * is there must show the picture. Read the way the product reads it, through
 * the signed URL the batch's detail hands out.
 *
 * @param options.page A page in the uploader's context, in the browser that
 *   drew the posters.
 * @param options.sessionId The batch.
 */
export async function expectThePostersShowTheClip(options: {
  page: Page;
  sessionId: string;
}): Promise<void> {
  const response = await options.page.request.get(
    `/api/upload-sessions/${options.sessionId}`,
  );
  expect(response.status()).toBe(200);
  const detail = uploadSessionDetailSchema.parse(await response.json());
  await Promise.all(
    H264_NAMES.map(async (name) => {
      const posterUrl = detail.files.find((file) => {
        return file.originalFilename === name;
      })?.media?.poster?.url;
      expect(posterUrl, name).toBeDefined();
      const poster = await fetch(posterUrl ?? "");
      expect(poster.status, name).toBe(200);
      const span = await _getLuminanceSpanFromPicture({
        page: options.page,
        bytes: Buffer.from(await poster.arrayBuffer()),
      });
      expect(span, name).toBeGreaterThan(MIN_POSTER_LUMINANCE_SPAN);
    }),
  );
}

/**
 * The large file went up in parts and was completed; a small one went up
 * whole and never opened a multipart upload.
 *
 * Read from the stand-in's statuses, not only its operations: a part counts
 * once the stand-in stored it, and the multipart upload is complete only if
 * a `CompleteMultipartUpload` was answered `200`.
 *
 * @param options.sessionId The batch.
 * @param options.files The batch's records.
 * @param options.requests The stand-in's log.
 * @param options.multipartBytes The large file's size.
 */
export function expectTheTransferPaths(options: {
  sessionId: string;
  files: readonly UploadedFileRecord[];
  requests: readonly FakeS3Request[];
  multipartBytes: number;
}): void {
  const { sessionId, files, requests } = options;
  const big = getOriginalRequestsFromRequests({
    requests,
    sessionId,
    fileId: getFileByName(files, MULTIPART_FIXTURE_NAME).fileId,
  });
  const partCount = Math.ceil(
    options.multipartBytes / appConfig.upload.multipartPartSizeBytes,
  );
  const storedParts = big.filter((request) => {
    return request.operation === "UploadPart" && request.status === 200;
  });
  expect(big[0]).toMatchObject({
    operation: "CreateMultipartUpload",
    status: 200,
  });
  expect(storedParts).toHaveLength(partCount);
  expect(big).toContainEqual(
    expect.objectContaining({
      operation: "CompleteMultipartUpload",
      status: 200,
    }),
  );
  expect(big.map(_getOperationFromRequest)).not.toContain("PutObject");
  const small = getOriginalRequestsFromRequests({
    requests,
    sessionId,
    fileId: getFileByName(files, "portrait-orientation-6.jpg").fileId,
  });
  expect(small[0]).toMatchObject({ operation: "PutObject", status: 200 });
  expect(small.map(_getOperationFromRequest)).not.toContain(
    "CreateMultipartUpload",
  );
}

/** One log entry's operation name. */
function _getOperationFromRequest(request: Readonly<FakeS3Request>): string {
  return request.operation;
}

/**
 * Exactly one completion settled the batch, the engine said so once, and the
 * session row agrees.
 *
 * @param options.sessionId The batch.
 * @param options.proof The harness's record of the run that finished it.
 */
export async function expectSettledOnce(options: {
  sessionId: string;
  proof: Readonly<UploadProofState>;
}): Promise<void> {
  const completions = getEventsFromState({
    state: options.proof,
    kind: "file-done",
  });
  const settling = completions.filter((event) => {
    return event.response.didSettle;
  });
  expect(settling).toHaveLength(1);
  expect(getEventsFromState({ state: options.proof, kind: "settled" })).toEqual(
    [{ kind: "settled", sessionState: "settled" }],
  );
  expect(await readUploadSession(options.sessionId)).toMatchObject({
    state: "settled",
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
export async function expectTheDuplicateSkipped(options: {
  sessionId: string;
  proof: Readonly<UploadProofState>;
  files: readonly UploadedFileRecord[];
  requests: readonly FakeS3Request[];
}): Promise<void> {
  const original = getFileByName(options.files, "portrait-orientation-6.jpg");
  const copy = getFileByName(options.files, DUPLICATE_FIXTURE_NAME);
  expect(original.state).toBe("done");
  expect(copy).toMatchObject({
    state: "cancelled",
    problemCode: null,
    item: null,
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

/**
 * One `upload_session` message to every member who should hear, to nobody
 * else, and to nobody twice.
 *
 * @param sessionId The batch.
 */
export async function expectOneEmailPerRecipient(
  sessionId: string,
): Promise<void> {
  const addresses = await readUploadSessionEmailAddresses(sessionId);
  // Equal to the sorted eligible set, which is also the duplicate check: a
  // second row for anybody would make the two lists differ.
  expect(addresses).toEqual(
    await readEligibleRecipientAddresses(UPLOADER_EMAIL),
  );
  expect(addresses).toContain(FAMILY_EMAIL);
  expect(addresses).not.toContain(UPLOADER_EMAIL);
  const session = await readUploadSession(sessionId);
  expect(session.notifiedMemberCount).toBe(addresses.length);
}
