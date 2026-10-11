import { createHash } from "node:crypto";
import { expect } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import type { ManifestEntry } from "@memory-shoebox/shared";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import {
  insertMember,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { makeUploadStorageKeyFromRendition } from "../../../../src/upload/presignUploadFile/uploadStorageKeyHelpers.ts";
import type { UploadFileRow } from "../../../../src/upload/uploadSessionAccessHelpers.ts";
import { ADMIN } from "./timezoneChangeTestHelpers.ts";

type FixtureContext = Awaited<ReturnType<typeof createOwnedTestApp>> & {
  sessionId: string;
};
type FixtureOperations = {
  manifest: (
    files: readonly ManifestEntry[],
  ) => Promise<LightMyRequestResponse>;
  saveTimezone: () => Promise<LightMyRequestResponse>;
  readFiles: () => Promise<UploadFileRow[]>;
  complete: (fileId: string) => Promise<LightMyRequestResponse>;
  commit: () => Promise<void>;
};

/** UTC midnight evidence whose New York calendar day is September 13. */
export const CAPTURE_INSTANT = "2026-09-14T00:30:00.000Z";

async function _completeFile(
  options: Readonly<{ context: FixtureContext; fileId: string }>,
): Promise<LightMyRequestResponse> {
  const { context, fileId } = options;
  const contentHash = createHash("sha256").update(fileId).digest("hex");
  const storageKey = makeUploadStorageKeyFromRendition({
    sessionId: context.sessionId,
    fileId,
    purpose: "original",
    declaredContentType: "image/jpeg",
  });
  await context.database
    .updateTable("upload_files")
    .set({
      state: "sending",
      storage_key: storageKey,
      content_hash: contentHash,
    })
    .where("id", "=", fileId)
    .execute();
  context.b2.storedObjects.set(storageKey, {
    sizeBytes: 1024,
    contentType: "image/jpeg",
  });
  return context.app.inject({
    method: "POST",
    url: `/api/upload-sessions/${context.sessionId}/files/${fileId}/complete`,
    payload: {
      outcome: "done",
      contentHash,
      byteSize: 1024,
      width: 100,
      height: 100,
    },
  });
}

function _makeOperations(context: Readonly<FixtureContext>): FixtureOperations {
  return {
    manifest: (files) => {
      return context.app.inject({
        method: "PATCH",
        url: `/api/upload-sessions/${context.sessionId}/manifest`,
        payload: { files },
      });
    },
    saveTimezone: () => {
      return context.app.inject({
        method: "PATCH",
        url: "/api/settings",
        payload: { shoebox: { timezone: "America/New_York" } },
      });
    },
    readFiles: () => {
      return context.database
        .selectFrom("upload_files")
        .selectAll()
        .where("upload_session_id", "=", context.sessionId)
        .orderBy("position")
        .execute();
    },
    complete: (fileId) => {
      return _completeFile({ context, fileId });
    },
    commit: async () => {
      const response = await context.app.inject({
        method: "POST",
        url: `/api/upload-sessions/${context.sessionId}/commit`,
        payload: { intent: "arm" },
      });
      expect(response.statusCode).toBe(200);
    },
  };
}

/** Real routes over an owned in-memory catalog and fake object storage. */
export async function createTimezoneUploadFixture(): Promise<
  FixtureContext & FixtureOperations
> {
  const context = await createOwnedTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertMember(context.database, { id: ADMIN.memberId, role: "admin" });
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: ADMIN.memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
  });
  const fixture = { ...context, sessionId };
  return { ...fixture, ..._makeOperations(fixture) };
}

/** Offset-less EXIF evidence declared in UTC. */
export function makeTimezoneManifestEntry(clientRef: string): ManifestEntry {
  return {
    clientRef,
    originalFilename: `${clientRef}.jpg`,
    declaredContentType: "image/jpeg",
    declaredBytes: 1024,
    capture: { exifCapturedAtLocal: "2026-09-14T00:30:00" },
  };
}
