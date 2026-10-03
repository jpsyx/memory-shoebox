import {
  TIMEZONE,
  EXIF_EVIDENCE,
  makeHash,
  makeEntry,
  readFiles,
  setUpUploadTestContext,
} from "./uploadManifestTestHelpers.ts";

import { describe, expect, it } from "vitest";
import { type PutUploadManifestResponse } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../../app.config.ts";

import { getCaptureDateFromEvidence } from "../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.ts";

import {
  insertUploadFile,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("PATCH /api/upload-sessions/:sessionId/manifest", () => {
  it("creates a waiting row per new file, with the ladder's verdict frozen", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();

    const response = await patchManifest([
      makeEntry({ clientRef: "a" }),
      makeEntry({
        clientRef: "b",
        originalFilename: "IMG_20260915_071500.jpg",
        capture: undefined,
      }),
    ]);

    expect(response.statusCode).toBe(200);
    const body = response.json<PutUploadManifestResponse>();
    expect(body).toMatchObject({ sessionId, fileCount: 2 });
    expect(body.totalBytes).toBe(4_800_000);
    expect(
      body.outcomes.map((outcome) => {
        return [outcome.clientRef, outcome.disposition, outcome.state];
      }),
    ).toEqual([
      ["a", "created", "waiting"],
      ["b", "created", "waiting"],
    ]);

    const fromExif = getCaptureDateFromEvidence({
      evidence: EXIF_EVIDENCE,
      originalFilename: "IMG_a.jpg",
      timezone: TIMEZONE,
      declaredAt: NOW,
    });
    const fromName = getCaptureDateFromEvidence({
      evidence: undefined,
      originalFilename: "IMG_20260915_071500.jpg",
      timezone: TIMEZONE,
      declaredAt: NOW,
    });
    const rows = await readFiles({ database: database, sessionId: sessionId });
    expect(
      rows.map((row) => {
        return row.position;
      }),
    ).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      state: "waiting",
      kind: "photo",
      attempt_count: 0,
      captured_at: fromExif.capturedAt,
      capture_date: fromExif.captureDate,
      capture_offset_minutes: fromExif.captureOffsetMinutes,
      capture_source: fromExif.captureSource,
      original_captured_at: fromExif.capturedAt,
    });
    expect(rows[1]).toMatchObject({
      capture_source: fromName.captureSource,
      original_captured_at: fromName.capturedAt,
    });
    expect(body.outcomes[0]?.capturedOn).toBe(fromExif.captureDate);

    const session = await database
      .selectFrom("upload_sessions")
      .select("last_activity_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_activity_at).toBe(NOW);
    await close();
  });

  it("refuses a PDF, an empty file and an oversized one before any byte moves", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();

    const response = await patchManifest([
      makeEntry({
        clientRef: "pdf",
        originalFilename: "menu.pdf",
        declaredContentType: "application/pdf",
      }),
      makeEntry({ clientRef: "empty", declaredBytes: 0 }),
      makeEntry({
        clientRef: "huge",
        originalFilename: "long.mov",
        declaredContentType: "video/quicktime",
        declaredBytes: appConfig.upload.maxFileBytes + 1,
      }),
      makeEntry({
        clientRef: "video",
        originalFilename: "VID_0001.mp4",
        declaredContentType: "video/mp4",
        declaredBytes: 50_000_000,
      }),
    ]);

    const body = response.json<PutUploadManifestResponse>();
    expect(
      body.outcomes.map((outcome) => {
        return [outcome.disposition, outcome.problemCode];
      }),
    ).toEqual([
      ["refused", "unsupported_type"],
      ["refused", "empty_file"],
      ["refused", "too_large"],
      ["created", null],
    ]);
    // Counted, so the batch still settles; not summed, so "5.2 GB" is true.
    expect(body.fileCount).toBe(4);
    expect(body.totalBytes).toBe(50_000_000);

    const rows = await readFiles({ database: database, sessionId: sessionId });
    expect(rows[0]).toMatchObject({
      state: "refused",
      kind: null,
      captured_at: null,
      original_captured_at: null,
    });
    expect(rows[3]?.kind).toBe("video");
    await close();
  });

  it("matches by hash before name, and reports what already landed", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext({
        state: "uploading",
        committed_at: NOW,
      });
    const landedHash = makeHash("landed");
    const landedId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      original_filename: "IMG_0001.jpg",
      declared_bytes: 2048,
      content_hash: landedHash,
      state: "done",
    });
    const unsentId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      original_filename: "IMG_0002.jpg",
      declared_bytes: 2048,
    });

    const response = await patchManifest([
      // Renamed since it landed, and now carrying the other row's name: the
      // bytes say which file it is, and the name is never identity.
      makeEntry({
        clientRef: "renamed",
        originalFilename: "IMG_0002.jpg",
        declaredBytes: 2048,
        contentHash: landedHash,
      }),
      makeEntry({
        clientRef: "unhashed",
        originalFilename: "IMG_0002.jpg",
        declaredBytes: 2048,
      }),
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json<PutUploadManifestResponse>().outcomes).toEqual([
      expect.objectContaining({
        clientRef: "renamed",
        fileId: landedId,
        disposition: "already_done",
        state: "done",
      }),
      expect.objectContaining({
        clientRef: "unhashed",
        fileId: unsentId,
        disposition: "matched",
        state: "waiting",
      }),
    ]);
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toHaveLength(2);
    await close();
  });

  it("collapses a hashed file picked twice, and keeps two unhashed files of one name", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const hash = makeHash("picked twice");

    const response = await patchManifest([
      makeEntry({ clientRef: "by-drag", contentHash: hash }),
      makeEntry({ clientRef: "by-picker", contentHash: hash }),
      makeEntry({ clientRef: "no-hash-1", originalFilename: "IMG_9.jpg" }),
      makeEntry({ clientRef: "no-hash-2", originalFilename: "IMG_9.jpg" }),
    ]);

    const outcomes = response.json<PutUploadManifestResponse>().outcomes;
    // Two unhashed files of one name and size may be two photographs from two
    // folders: presign cancels the copy once the hashes are known.
    expect(
      outcomes.map((outcome) => {
        return outcome.disposition;
      }),
    ).toEqual(["created", "matched", "created", "created"]);
    expect(outcomes[1]?.fileId).toBe(outcomes[0]?.fileId);
    expect(outcomes[3]?.fileId).not.toBe(outcomes[2]?.fileId);
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toHaveLength(3);
    await close();
  });

  it("leaves two unhashed files of one name as two rows when the body is sent again", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext();
    const body = [
      makeEntry({ clientRef: "no-hash-1", originalFilename: "IMG_9.jpg" }),
      makeEntry({ clientRef: "no-hash-2", originalFilename: "IMG_9.jpg" }),
    ];

    const first = await patchManifest(body);
    const second = await patchManifest(body);

    const firstOutcomes = first.json<PutUploadManifestResponse>().outcomes;
    const secondOutcomes = second.json<PutUploadManifestResponse>().outcomes;
    expect(
      secondOutcomes.map((outcome) => {
        return outcome.disposition;
      }),
    ).toEqual(["matched", "matched"]);
    expect(
      secondOutcomes.map((outcome) => {
        return outcome.fileId;
      }),
    ).toEqual(
      firstOutcomes.map((outcome) => {
        return outcome.fileId;
      }),
    );
    expect(firstOutcomes[0]?.fileId).not.toBe(firstOutcomes[1]?.fileId);
    expect(
      await readFiles({ database: database, sessionId: sessionId }),
    ).toHaveLength(2);
    await close();
  });

  it.each([
    { label: "without a hash", contentHash: undefined },
    { label: "with a hash", contentHash: makeHash("menu") },
  ])(
    "keeps one refused row when a draft's body is sent again, $label",
    async ({ contentHash }) => {
      const { database, sessionId, patchManifest, close } =
        await setUpUploadTestContext();
      const body = [
        makeEntry({
          clientRef: "pdf",
          originalFilename: "menu.pdf",
          declaredContentType: "application/pdf",
          contentHash,
        }),
        makeEntry({ clientRef: "photo" }),
      ];

      const first = await patchManifest(body);
      const rowsBefore = await readFiles({
        database: database,
        sessionId: sessionId,
      });
      const second = await patchManifest(body);

      const firstOutcomes = first.json<PutUploadManifestResponse>().outcomes;
      expect(second.statusCode).toBe(200);
      expect(second.json<PutUploadManifestResponse>().outcomes).toEqual([
        {
          ...firstOutcomes[0],
          disposition: "refused",
          state: "refused",
          problemCode: "unsupported_type",
        },
        { ...firstOutcomes[1], disposition: "matched" },
      ]);
      expect(
        await readFiles({ database: database, sessionId: sessionId }),
      ).toEqual(rowsBefore);
      expect(rowsBefore).toHaveLength(2);
      await close();
    },
  );
});
