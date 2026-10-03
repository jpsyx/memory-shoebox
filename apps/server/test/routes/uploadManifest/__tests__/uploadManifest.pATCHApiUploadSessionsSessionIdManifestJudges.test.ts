import {
  TIMEZONE,
  EXIF_EVIDENCE,
  AMENDED_AT,
  makeHash,
  makeEntry,
  readFiles,
  setUpUploadTestContext,
} from "./uploadManifestTestHelpers.ts";

import { describe, expect, it } from "vitest";
import { type PutUploadManifestResponse } from "@memory-shoebox/shared";

import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
} from "../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.ts";

import {
  insertUploadFile,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("PATCH /api/upload-sessions/:sessionId/manifest", () => {
  it("judges a file afresh when a refused one's name and size come back with another type", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const mislabelled = makeEntry({
      clientRef: "mislabelled",
      originalFilename: "scan.jpg",
      declaredContentType: "application/octet-stream",
    });
    await patchManifest([mislabelled]);

    const response = await patchManifest([
      { ...mislabelled, declaredContentType: "image/jpeg" },
    ]);

    expect(
      response.json<PutUploadManifestResponse>().outcomes.map((outcome) => {
        return [outcome.disposition, outcome.state];
      }),
    ).toEqual([["created", "waiting"]]);
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toHaveLength(2);
    await close();
  });

  it.each([
    { label: "unhashed, resumed without a hash", seeded: false, sent: false },
    { label: "unhashed, resumed with its hash", seeded: false, sent: true },
    { label: "hashed, resumed with its hash", seeded: true, sent: true },
  ])(
    "reports a refused file as refused, never a conflict, after commit: $label",
    async ({ seeded, sent }) => {
      const { database, sessionId, patchManifest, close } =
        await setUpUploadTestContext({
          state: "uploading",
          committed_at: NOW,
        });
      const pdfHash = makeHash("menu");
      const pdfId = await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 1,
        original_filename: "menu.pdf",
        declared_content_type: "application/pdf",
        declared_bytes: 1234,
        content_hash: seeded ? pdfHash : null,
        kind: null,
        state: "refused",
        problem_code: "unsupported_type",
        problem_detail: "The Shoebox does not take files of this type.",
      });
      const photoId = await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 2,
        original_filename: "IMG_0002.jpg",
        declared_bytes: 2048,
      });
      const rowsBefore = await readFiles({
        database: database,
        sessionId: sessionId,
      });

      const response = await patchManifest([
        makeEntry({
          clientRef: "pdf",
          originalFilename: "menu.pdf",
          declaredContentType: "application/pdf",
          declaredBytes: 1234,
          contentHash: sent ? pdfHash : undefined,
        }),
        makeEntry({
          clientRef: "photo",
          originalFilename: "IMG_0002.jpg",
          declaredBytes: 2048,
        }),
      ]);

      expect(response.statusCode).toBe(200);
      expect(response.json<PutUploadManifestResponse>().outcomes).toEqual([
        expect.objectContaining({
          clientRef: "pdf",
          fileId: pdfId,
          disposition: "refused",
          state: "refused",
          problemCode: "unsupported_type",
        }),
        expect.objectContaining({
          clientRef: "photo",
          fileId: photoId,
          disposition: "matched",
        }),
      ]);
      expect(
        await readFiles({ database: database, sessionId: sessionId }),
      ).toEqual(rowsBefore);
      await close();
    },
  );

  it("names a row by its id even when the entry also carries a hash", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const first = await patchManifest([
      makeEntry({ clientRef: "a", contentHash: makeHash("a") }),
      makeEntry({ clientRef: "b", contentHash: makeHash("b") }),
    ]);
    const [aId, bId] = first
      .json<PutUploadManifestResponse>()
      .outcomes.map((outcome) => {
        return outcome.fileId;
      });

    // Both entries carry b's hash: the id decides, and neither collapses into
    // the other nor into the row the hash alone would have found.
    const second = await patchManifest([
      makeEntry({
        clientRef: "fix-a",
        fileId: aId,
        contentHash: makeHash("b"),
        capturedAt: AMENDED_AT,
      }),
      makeEntry({
        clientRef: "again-b",
        fileId: bId,
        contentHash: makeHash("b"),
      }),
    ]);

    expect(second.statusCode).toBe(200);
    expect(
      second.json<PutUploadManifestResponse>().outcomes.map((outcome) => {
        return [outcome.clientRef, outcome.fileId, outcome.disposition];
      }),
    ).toEqual([
      ["fix-a", aId, "amended"],
      ["again-b", bId, "matched"],
    ]);
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toHaveLength(2);
    await close();
  });

  it("refuses two entries that name one file id, rather than dropping the second date", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const first = await patchManifest([makeEntry({ clientRef: "a" })]);
    const fileId = first.json<PutUploadManifestResponse>().outcomes[0]?.fileId;
    const before = await readFiles({
      database: database,
      sessionId: sessionId,
    });

    const response = await patchManifest([
      makeEntry({ clientRef: "fix-1", fileId, capturedAt: AMENDED_AT }),
      makeEntry({
        clientRef: "fix-2",
        fileId,
        capturedAt: "2026-09-17T04:41:32.000Z",
      }),
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_request",
      details: { fieldErrors: { "files.1.fileId": [expect.any(String)] } },
    });
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toEqual(before);
    await close();
  });

  it("leaves every row a request does not amend exactly as it was", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const first = await patchManifest(
      Array.from({ length: 24 }, (_unused, index) => {
        return makeEntry({
          clientRef: `file-${index}`,
          contentHash: makeHash(`file-${index}`),
        });
      }),
    );
    const amendedId =
      first.json<PutUploadManifestResponse>().outcomes[2]?.fileId ?? "";
    const before = await readFiles({
      database: database,
      sessionId: sessionId,
    });

    // Four of the twenty-four, every way a row can be named: two re-declared
    // by hash, one amended by id, one brand new.
    const second = await patchManifest([
      makeEntry({ clientRef: "again-0", contentHash: makeHash("file-0") }),
      makeEntry({ clientRef: "again-1", contentHash: makeHash("file-1") }),
      makeEntry({
        clientRef: "fix-2",
        fileId: amendedId,
        capturedAt: AMENDED_AT,
      }),
      makeEntry({ clientRef: "new-24", contentHash: makeHash("file-24") }),
    ]);

    expect(second.statusCode).toBe(200);
    const after = await readFiles({ database: database, sessionId: sessionId });
    expect(after).toHaveLength(25);
    expect(
      after.filter((row) => {
        return row.id !== amendedId && row.position <= 24;
      }),
    ).toEqual(
      before.filter((row) => {
        return row.id !== amendedId;
      }),
    );
    await close();
  });

  it("amends only the capture columns, and never the frozen original", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    await patchManifest([makeEntry({ clientRef: "a" })]);
    const [beforeRow] = await readFiles({
      database: database,
      sessionId: sessionId,
    });
    const declared = getCaptureDateFromEvidence({
      evidence: EXIF_EVIDENCE,
      originalFilename: "IMG_a.jpg",
      timezone: TIMEZONE,
      declaredAt: NOW,
    });
    const expected = getCaptureDateFromUploaderDate({
      capturedAt: AMENDED_AT,
      previous: declared,
      timezone: TIMEZONE,
    });

    const response = await patchManifest([
      makeEntry({
        clientRef: "fix",
        fileId: beforeRow?.id,
        capturedAt: AMENDED_AT,
      }),
    ]);

    expect(expected.captureSource).toBe("uploader_set");
    expect(response.json<PutUploadManifestResponse>().outcomes).toEqual([
      expect.objectContaining({
        clientRef: "fix",
        fileId: beforeRow?.id,
        disposition: "amended",
        state: "waiting",
        capturedOn: expected.captureDate,
        captureSource: "uploader_set",
      }),
    ]);
    const [afterRow] = await readFiles({
      database: database,
      sessionId: sessionId,
    });
    expect(afterRow).toEqual({
      ...beforeRow,
      captured_at: expected.capturedAt,
      capture_date: expected.captureDate,
      capture_offset_minutes: expected.captureOffsetMinutes,
      capture_source: expected.captureSource,
      updated_at: NOW,
    });
    expect(afterRow?.original_captured_at).toBe(declared.capturedAt);
    await close();
  });
});
