import { describe, expect, it } from "vitest";
import {
  UPLOAD_LIMITS,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import {
  insertUploadFile,
  insertMilestone,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  makeEntry,
  makeHash,
  readFiles,
  setUpUploadTestContext,
} from "../../uploadManifest/__tests__/uploadManifestTestHelpers.ts";
import { removeUploadFilesFromTestContext } from "./uploadFileRemovalTestHelpers.ts";

describe("DELETE /api/upload-sessions/:sessionId/files", () => {
  it("removes obsolete undated and milestone prompts with their last target", async () => {
    const context = await setUpUploadTestContext();
    const fileId = await insertUploadFile(context.database, {
      uploadSessionId: context.sessionId,
      captured_at: NOW,
      capture_date: "2026-09-27",
      capture_source: "file_mtime",
      original_captured_at: NOW,
    });
    const milestoneId = await insertMilestone(context.database, {
      name: "Holiday",
      startsOn: "2026-09-01",
    });
    const edit = await context.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${context.sessionId}/edits`,
      headers: { cookie: context.cookie },
      payload: { kind: "milestone", milestoneId, targetFileIds: [fileId] },
    });
    expect(edit.statusCode).toBe(201);
    const before = await context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${context.sessionId}`,
      headers: { cookie: context.cookie },
    });
    expect(before.json().undated.fileCount).toBe(1);
    expect(before.json().mismatches).toHaveLength(1);

    const removed = await removeUploadFilesFromTestContext({
      context,
      fileIds: [fileId],
    });

    expect(removed.statusCode).toBe(204);
    const after = await context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${context.sessionId}`,
      headers: { cookie: context.cookie },
    });
    expect(after.json()).toMatchObject({
      undated: null,
      mismatches: [],
      edits: [],
      days: [],
      pendingFiles: [],
    });
    expect(
      await context.database
        .selectFrom("milestones")
        .select("id")
        .where("id", "=", milestoneId)
        .execute(),
    ).toHaveLength(1);
    await context.close();
  });

  it("removes one file and retains the surviving ids, capture edits and labels", async () => {
    const context = await setUpUploadTestContext();
    const declared = await context.patchManifest([
      makeEntry({ clientRef: "first", contentHash: makeHash("first") }),
      makeEntry({ clientRef: "second", contentHash: makeHash("second") }),
      makeEntry({ clientRef: "third", contentHash: makeHash("third") }),
      makeEntry({
        clientRef: "refused",
        declaredContentType: "application/pdf",
      }),
    ]);
    expect(declared.statusCode).toBe(200);
    const files = await readFiles(context);
    const removedId = files[0]!.id;
    const survivor = files[1]!;
    const otherSurvivor = files[2]!;
    const amended = await context.patchManifest([
      makeEntry({
        clientRef: "second",
        fileId: survivor.id,
        capturedAt: "2026-09-16T00:00:00.000Z",
      }),
    ]);
    expect(amended.statusCode).toBe(200);
    const edit = await context.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${context.sessionId}/edits`,
      headers: { cookie: context.cookie },
      payload: {
        kind: "tag",
        targetFileIds: [removedId, survivor.id],
        labelSnapshot: "Birthday",
      },
    });
    const emptyEdit = await context.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${context.sessionId}/edits`,
      headers: { cookie: context.cookie },
      payload: {
        kind: "person",
        targetFileIds: [removedId],
        labelSnapshot: "Mistake",
      },
    });
    expect(edit.statusCode).toBe(201);
    expect(emptyEdit.statusCode).toBe(201);
    const rowsBeforeRemoval = await readFiles(context);
    await context.database
      .updateTable("upload_sessions")
      .set({ last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }) })
      .where("id", "=", context.sessionId)
      .execute();

    const response = await removeUploadFilesFromTestContext({
      context,
      fileIds: [removedId],
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await readFiles(context)).toEqual(rowsBeforeRemoval.slice(1));
    const detailResponse = await context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${context.sessionId}`,
      headers: { cookie: context.cookie },
    });
    const detail = detailResponse.json<UploadSessionDetail>();
    expect(detail.fileCount).toBe(3);
    expect(detail.totalBytes).toBe(4_800_000);
    expect(detail.lastActivityAt).toBe(NOW);
    expect(detail.progress).toMatchObject({ waitingCount: 2, refusedCount: 1 });
    expect(
      detail.files.map((file) => {
        return file.fileId;
      }),
    ).toEqual([survivor.id, otherSurvivor.id, files[3]!.id]);
    expect(detail.files[0]).toMatchObject({
      fileId: survivor.id,
      capturedOn: "2026-09-16",
      captureSource: "uploader_set",
    });
    expect(
      detail.days.map((day) => {
        return {
          capturedOn: day.capturedOn,
          fileCount: day.fileCount,
        };
      }),
    ).toEqual([
      { capturedOn: "2026-09-14", fileCount: 1 },
      { capturedOn: "2026-09-16", fileCount: 1 },
    ]);
    expect(detail.edits).toMatchObject([
      { editId: edit.json().editId, label: "Birthday", targetCount: 1 },
    ]);
    expect(detail.edits).toHaveLength(1);
    const targets = await context.database
      .selectFrom("upload_batch_edit_targets")
      .selectAll()
      .execute();
    expect(
      targets.map((target) => {
        return target.upload_file_id;
      }),
    ).toEqual([survivor.id]);
    expect(
      await context.database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(context.b2.calls).toEqual([]);
    await context.close();
  });

  it("removes many files including refused rows, then permits a fresh pick of the same file", async () => {
    const context = await setUpUploadTestContext();
    const readdedEntry = makeEntry({
      clientRef: "first",
      contentHash: makeHash("first"),
    });
    await context.patchManifest([
      readdedEntry,
      makeEntry({ clientRef: "second", contentHash: makeHash("second") }),
      makeEntry({ clientRef: "third", contentHash: makeHash("third") }),
      makeEntry({
        clientRef: "refused",
        declaredContentType: "application/pdf",
      }),
    ]);
    const files = await readFiles(context);
    const response = await removeUploadFilesFromTestContext({
      context,
      fileIds: [files[0]!.id, files[2]!.id, files[3]!.id],
    });
    expect(response.statusCode).toBe(204);
    const added = await context.patchManifest([
      readdedEntry,
      makeEntry({ clientRef: "new" }),
    ]);
    expect(added.statusCode).toBe(200);
    expect(added.json()).toMatchObject({ fileCount: 3, totalBytes: 7_200_000 });
    expect(
      added.json().outcomes.map((outcome: { disposition: string }) => {
        return outcome.disposition;
      }),
    ).toEqual(["created", "created"]);
    const remaining = await readFiles(context);
    expect(
      remaining.map((file) => {
        return file.position;
      }),
    ).toEqual([2, 3, 4]);
    expect(remaining[0]!.id).toBe(files[1]!.id);
    expect(remaining[1]!.id).not.toBe(files[0]!.id);
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${context.sessionId}`,
      headers: { cookie: context.cookie },
    });
    expect(detail.json()).toMatchObject({
      fileCount: 3,
      totalBytes: 7_200_000,
    });
    await context.close();
  });

  it("removes every file and leaves a draft that cannot arm until another file is picked", async () => {
    const context = await setUpUploadTestContext();
    await context.patchManifest([
      makeEntry({ clientRef: "first" }),
      makeEntry({ clientRef: "second" }),
    ]);
    const files = await readFiles(context);
    expect(
      (
        await removeUploadFilesFromTestContext({
          context,
          fileIds: files.map((file) => {
            return file.id;
          }),
        })
      ).statusCode,
    ).toBe(204);
    const detailResponse = await context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${context.sessionId}`,
      headers: { cookie: context.cookie },
    });
    expect(detailResponse.json()).toMatchObject({
      state: "draft",
      fileCount: 0,
      totalBytes: 0,
      days: [],
      edits: [],
      files: [],
      undated: null,
      mismatches: [],
    });
    const arm = await context.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${context.sessionId}/commit`,
      headers: { cookie: context.cookie },
      payload: { intent: "arm" },
    });
    expect(arm.statusCode).toBe(400);
    expect(arm.json().error).toBe("upload_session_empty");
    expect(
      (await context.patchManifest([makeEntry({ clientRef: "new" })]))
        .statusCode,
    ).toBe(200);
    expect((await readFiles(context))[0]!.position).toBe(1);
    await context.close();
  });

  it("serializes removal with arming so a newly committed file cannot disappear", async () => {
    const context = await setUpUploadTestContext();
    await context.patchManifest([makeEntry({ clientRef: "first" })]);
    const [file] = await readFiles(context);
    const [armed, removed] = await Promise.all([
      context.app.inject({
        method: "POST",
        url: `/api/upload-sessions/${context.sessionId}/commit`,
        headers: { cookie: context.cookie },
        payload: { intent: "arm" },
      }),
      removeUploadFilesFromTestContext({ context, fileIds: [file!.id] }),
    ]);
    if (armed.statusCode === 200) {
      expect(removed.statusCode).toBe(409);
      expect(await readFiles(context)).toHaveLength(1);
    } else {
      expect(armed.statusCode).toBe(400);
      expect(armed.json().error).toBe("upload_session_empty");
      expect(removed.statusCode).toBe(204);
      expect(await readFiles(context)).toEqual([]);
    }
    await context.close();
  });

  it("removes a full manifest request's distinct file ids", async () => {
    const context = await setUpUploadTestContext();
    const manifest = await context.patchManifest(
      Array.from(
        { length: UPLOAD_LIMITS.manifestEntriesPerRequest },
        (_unused, index) => {
          return makeEntry({ clientRef: `file-${index}` });
        },
      ),
    );
    expect(manifest.statusCode).toBe(200);
    const files = await readFiles(context);
    expect(
      (
        await removeUploadFilesFromTestContext({
          context,
          fileIds: files.map((file) => {
            return file.id;
          }),
        })
      ).statusCode,
    ).toBe(204);
    expect(await readFiles(context)).toEqual([]);
    await context.close();
  });
});
