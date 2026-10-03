import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import {
  UPLOAD_LIMITS,
  type ManifestEntry,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
} from "../../src/upload/captureDateLadder.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const TIMEZONE = "Europe/Madrid";
const EXIF_EVIDENCE = {
  exifCapturedAtLocal: "2026-09-14T06:41:32",
  exifOffsetMinutes: 120,
};
const AMENDED_AT = "2026-09-16T04:41:32.000Z";

const makeHash = (seed: string): string => {
  return createHash("sha256").update(seed).digest("hex");
};

const makeEntry = (
  options: { clientRef: string } & Partial<ManifestEntry>,
): ManifestEntry => {
  return {
    originalFilename: `IMG_${options.clientRef}.jpg`,
    declaredContentType: "image/jpeg",
    declaredBytes: 2_400_000,
    capture: EXIF_EVIDENCE,
    ...options,
  };
};

const readFiles = async (database: Kysely<Database>, sessionId: string) => {
  return database
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", sessionId)
    .orderBy("position", "asc")
    .execute();
};

const setUp = async (
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
) => {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "shoebox.timezone",
    value: TIMEZONE,
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }),
    ...sessionOverrides,
  });
  const patchManifest = (files: readonly ManifestEntry[]) => {
    return testApp.app.inject({
      method: "PATCH",
      url: `/api/upload-sessions/${sessionId}/manifest`,
      headers: { cookie },
      payload: { files },
    });
  };
  return { ...testApp, cookie, memberId, sessionId, patchManifest };
};

describe("PATCH /api/upload-sessions/:sessionId/manifest", () => {
  it("creates a waiting row per new file, with the ladder's verdict frozen", async () => {
    const { database, sessionId, patchManifest, close } = await setUp();

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
    const rows = await readFiles(database, sessionId);
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
    const { database, sessionId, patchManifest, close } = await setUp();

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

    const rows = await readFiles(database, sessionId);
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
    const { database, sessionId, patchManifest, close } = await setUp({
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
    expect(await readFiles(database, sessionId)).toHaveLength(2);
    await close();
  });

  it("collapses the same file picked twice into one row", async () => {
    const { database, sessionId, patchManifest, close } = await setUp();
    const hash = makeHash("picked twice");

    const response = await patchManifest([
      makeEntry({ clientRef: "by-drag", contentHash: hash }),
      makeEntry({ clientRef: "by-picker", contentHash: hash }),
      makeEntry({ clientRef: "no-hash-1", originalFilename: "IMG_9.jpg" }),
      makeEntry({ clientRef: "no-hash-2", originalFilename: "IMG_9.jpg" }),
    ]);

    const outcomes = response.json<PutUploadManifestResponse>().outcomes;
    expect(
      outcomes.map((outcome) => {
        return outcome.disposition;
      }),
    ).toEqual(["created", "matched", "created", "matched"]);
    expect(outcomes[1]?.fileId).toBe(outcomes[0]?.fileId);
    expect(outcomes[3]?.fileId).toBe(outcomes[2]?.fileId);
    expect(await readFiles(database, sessionId)).toHaveLength(2);
    await close();
  });

  it("leaves every row a request does not amend exactly as it was", async () => {
    const { database, sessionId, patchManifest, close } = await setUp();
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
    const before = await readFiles(database, sessionId);

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
    const after = await readFiles(database, sessionId);
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
    const { database, sessionId, patchManifest, close } = await setUp();
    await patchManifest([makeEntry({ clientRef: "a" })]);
    const [beforeRow] = await readFiles(database, sessionId);
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
    const [afterRow] = await readFiles(database, sessionId);
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

  it("is closed to new files after commit, and to amending a file in flight", async () => {
    const { database, sessionId, patchManifest, close } = await setUp({
      state: "uploading",
      committed_at: NOW,
    });
    const capture = {
      captured_at: "2026-09-14T04:41:32.000Z",
      capture_date: "2026-09-14",
      capture_offset_minutes: 120,
      capture_source: "exif",
      original_captured_at: "2026-09-14T04:41:32.000Z",
    };
    const waitingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      ...capture,
    });
    const sendingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      state: "sending",
      content_hash: makeHash("sending"),
      ...capture,
    });

    const refused = await patchManifest([
      makeEntry({ clientRef: "new-one" }),
      makeEntry({
        clientRef: "fix-sending",
        fileId: sendingId,
        capturedAt: AMENDED_AT,
      }),
      makeEntry({
        clientRef: "fix-waiting",
        fileId: waitingId,
        capturedAt: AMENDED_AT,
      }),
    ]);

    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      error: "upload_manifest_conflict",
      details: { clientRefs: ["new-one", "fix-sending"] },
    });
    // All or nothing: the one entry that was fine was not written either.
    const unchanged = await readFiles(database, sessionId);
    expect(unchanged).toHaveLength(2);
    expect(unchanged[0]?.capture_source).toBe("exif");

    const allowed = await patchManifest([
      makeEntry({
        clientRef: "fix-waiting",
        fileId: waitingId,
        capturedAt: AMENDED_AT,
      }),
      makeEntry({ clientRef: "resumed", contentHash: makeHash("sending") }),
    ]);
    expect(allowed.statusCode).toBe(200);
    expect(
      allowed.json<PutUploadManifestResponse>().outcomes.map((outcome) => {
        return outcome.disposition;
      }),
    ).toEqual(["amended", "matched"]);
    await close();
  });

  it.each(["settled", "cancelled"])("refuses a %s session", async (state) => {
    const { patchManifest, close } = await setUp({
      state,
      committed_at: state === "settled" ? NOW : null,
      settled_at: state === "settled" ? NOW : null,
    });

    const response = await patchManifest([makeEntry({ clientRef: "a" })]);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    await close();
  });

  it("answers one 404 for a file id that is not in this session", async () => {
    const { database, memberId, patchManifest, close } = await setUp();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
    });

    const forElsewhere = await patchManifest([
      makeEntry({
        clientRef: "x",
        fileId: elsewhereId,
        capturedAt: AMENDED_AT,
      }),
    ]);
    const forNothing = await patchManifest([
      makeEntry({ clientRef: "x", fileId: createId(), capturedAt: AMENDED_AT }),
    ]);

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    await close();
  });

  it("caps one request at the manifest page size", async () => {
    const { patchManifest, close } = await setUp();

    const response = await patchManifest(
      Array.from(
        { length: UPLOAD_LIMITS.manifestEntriesPerRequest + 1 },
        (_unused, index) => {
          return makeEntry({ clientRef: `c${index}` });
        },
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    await close();
  });

  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, close } = await setUp();
    const { cookie: otherCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
      state: "draft",
      committed_at: null,
    });
    const send = (sessionIdToSend: string, cookie: string) => {
      return app.inject({
        method: "PATCH",
        url: `/api/upload-sessions/${sessionIdToSend}/manifest`,
        headers: { cookie },
        payload: { files: [makeEntry({ clientRef: "a" })] },
      });
    };

    const forOther = await send(sessionId, otherCookie);
    const forAdmin = await send(sessionId, adminCookie);
    const forNothing = await send(createId(), otherCookie);
    const forViewer = await send(viewerSessionId, viewer.cookie);

    expect(forOther.statusCode).toBe(404);
    expect(forOther.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forOther.body);
    expect(forNothing.body).toBe(forOther.body);
    expect(forViewer.statusCode).toBe(403);
    expect(forViewer.json().error).toBe("upload_forbidden");
    await close();
  });
});
