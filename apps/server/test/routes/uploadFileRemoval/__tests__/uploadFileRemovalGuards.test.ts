import { describe, expect, it } from "vitest";
import { UPLOAD_LIMITS } from "@memory-shoebox/shared";
import { createId } from "../../../../src/db/createId.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  readFiles,
  setUpUploadTestContext,
} from "../../uploadManifest/__tests__/uploadManifestTestHelpers.ts";
import { removeUploadFilesFromTestContext } from "./uploadFileRemovalTestHelpers.ts";

describe("draft file removal guards", () => {
  it.each(["foreign", "missing"])(
    "rejects a mixed %s id selection atomically with a private 404",
    async (invalidKind) => {
      const context = await setUpUploadTestContext();
      const ownFileId = await insertUploadFile(context.database, {
        uploadSessionId: context.sessionId,
      });
      const foreignSessionId = await insertUploadSession(context.database, {
        uploadedBy: context.memberId,
        state: "cancelled",
        committed_at: null,
      });
      const foreignId = await insertUploadFile(context.database, {
        uploadSessionId: foreignSessionId,
      });
      const before = await context.database
        .selectFrom("upload_sessions")
        .selectAll()
        .where("id", "=", context.sessionId)
        .executeTakeFirstOrThrow();
      const response = await removeUploadFilesFromTestContext({
        context,
        fileIds: [
          ownFileId,
          invalidKind === "foreign" ? foreignId : createId(),
        ],
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("upload_file_not_found");
      expect(await readFiles(context)).toHaveLength(1);
      expect(
        await context.database
          .selectFrom("upload_sessions")
          .selectAll()
          .where("id", "=", context.sessionId)
          .executeTakeFirstOrThrow(),
      ).toEqual(before);
      const missingResponse = await removeUploadFilesFromTestContext({
        context,
        fileIds: [ownFileId, createId()],
      });
      expect(response.body).toBe(missingResponse.body);
      await context.close();
    },
  );

  it.each([
    { state: "draft", committed_at: NOW },
    { state: "uploading", committed_at: NOW },
    { state: "settled", committed_at: NOW, settled_at: NOW },
    { state: "cancelled", committed_at: null },
  ])(
    "rejects a $state session with committed_at $committed_at",
    async (overrides) => {
      const context = await setUpUploadTestContext({
        ...overrides,
        file_count: 7,
        total_bytes: 7000,
      });
      const fileId = await insertUploadFile(context.database, {
        uploadSessionId: context.sessionId,
      });
      const response = await removeUploadFilesFromTestContext({
        context,
        fileIds: [fileId],
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("upload_session_conflict");
      expect(await readFiles(context)).toHaveLength(1);
      const detail = await context.app.inject({
        method: "GET",
        url: `/api/upload-sessions/${context.sessionId}`,
        headers: { cookie: context.cookie },
      });
      expect(detail.json()).toMatchObject({ fileCount: 7, totalBytes: 7000 });
      await context.close();
    },
  );

  it("hides a stranger's draft from uploaders, admins and viewers before the role check", async () => {
    const context = await setUpUploadTestContext();
    const fileId = await insertUploadFile(context.database, {
      uploadSessionId: context.sessionId,
    });
    const outsiders = await Promise.all(
      ["uploader", "admin", "viewer"].map((role) => {
        return insertSignedInMember({
          database: context.database,
          token: role,
          member: { role },
        });
      }),
    );
    const responses = await Promise.all(
      outsiders.map(({ cookie }) => {
        return context.app.inject({
          method: "DELETE",
          url: `/api/upload-sessions/${context.sessionId}/files`,
          headers: { cookie },
          payload: { fileIds: [fileId] },
        });
      }),
    );
    const missing = await context.app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${createId()}/files`,
      headers: { cookie: outsiders[2]!.cookie },
      payload: { fileIds: [fileId] },
    });
    responses.forEach((response) => {
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("upload_session_not_found");
      expect(response.body).toBe(missing.body);
    });
    const viewer = outsiders[2]!;
    const viewerSessionId = await insertUploadSession(context.database, {
      uploadedBy: viewer.memberId,
      state: "draft",
      committed_at: null,
    });
    const ownDenied = await context.app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${viewerSessionId}/files`,
      headers: { cookie: viewer.cookie },
      payload: { fileIds: [fileId] },
    });
    expect(ownDenied.statusCode).toBe(403);
    expect(ownDenied.json().error).toBe("upload_forbidden");
    expect(await readFiles(context)).toHaveLength(1);
    await context.close();
  });

  it("validates the request before changing files and deduplicates valid ids", async () => {
    const context = await setUpUploadTestContext();
    const fileId = await insertUploadFile(context.database, {
      uploadSessionId: context.sessionId,
    });
    const invalidBodies = [
      { fileIds: [] },
      { fileIds: [fileId, "bad-id"] },
      {
        fileIds: Array.from(
          { length: UPLOAD_LIMITS.manifestEntriesPerRequest + 1 },
          () => {
            return fileId;
          },
        ),
      },
    ];
    const responses = await Promise.all(
      invalidBodies.map((payload) => {
        return context.app.inject({
          method: "DELETE",
          url: `/api/upload-sessions/${context.sessionId}/files`,
          headers: { cookie: context.cookie },
          payload,
        });
      }),
    );
    responses.forEach((response) => {
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("invalid_request");
    });
    expect(await readFiles(context)).toHaveLength(1);
    expect(
      (
        await removeUploadFilesFromTestContext({
          context,
          fileIds: [fileId, fileId],
        })
      ).statusCode,
    ).toBe(204);
    expect(await readFiles(context)).toEqual([]);
    await context.close();
  });

  it.each(["sending", "done", "failed", "cancelled"])(
    "does not erase a %s row in an inconsistent draft",
    async (state) => {
      const context = await setUpUploadTestContext();
      const fileId = await insertUploadFile(context.database, {
        uploadSessionId: context.sessionId,
        state,
      });
      const response = await removeUploadFilesFromTestContext({
        context,
        fileIds: [fileId],
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("upload_file_conflict");
      expect(await readFiles(context)).toHaveLength(1);
      await context.close();
    },
  );
});
