import { setImmediate } from "node:timers/promises";
import { expect, it } from "vitest";
import { createAuthenticator } from "../../../src/auth/createAuthenticator.ts";
import type { Authenticator } from "../../../src/http/requestContextHelpers.ts";
import { runObjectDeletionDrain } from "../../../src/jobs/runObjectDeletionDrain.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertPendingObjectDeletion,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

it("keeps a retry waiting for an in-flight deletion so its fresh object survives", async () => {
  const retryStarted = Promise.withResolvers<void>();
  const deletionStarted = Promise.withResolvers<void>();
  const deletionAllowed = Promise.withResolvers<void>();
  let authenticate: Authenticator = async () => {
    return undefined;
  };
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
    authenticate: async (request) => {
      if (request.url.endsWith("/retry")) {
        retryStarted.resolve();
      }
      return authenticate(request);
    },
  });
  const { database, b2, app } = context;
  authenticate = createAuthenticator({
    database,
    clock: () => {
      return new Date(NOW);
    },
  });
  const { memberId, cookie } = await insertSignedInMember({ database });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const fileId = await insertUploadFile(database, {
    uploadSessionId: sessionId,
    state: "failed",
    problem_code: "abandoned",
  });
  const storageKey = `uploads/${sessionId}/${fileId}/original.jpg`;
  await insertPendingObjectDeletion(database, { storageKey });
  b2.deleteObject = async ({ key }) => {
    deletionStarted.resolve();
    await deletionAllowed.promise;
    b2.storedObjects.delete(key);
  };

  const drain = runObjectDeletionDrain({ database, b2, now: NOW });
  await deletionStarted.promise;
  const retry = app.inject({
    method: "POST",
    url: `/api/upload-sessions/${sessionId}/files/${fileId}/retry`,
    headers: { cookie },
  });
  // Start the real request while deletion is blocked, then let its SQL work
  // run.
  void retry.then();
  await retryStarted.promise;
  await setImmediate();
  const fileBeforeDeletion = await database
    .selectFrom("upload_files")
    .select("state")
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
  deletionAllowed.resolve();
  await drain;
  const retried = await retry;

  try {
    expect(fileBeforeDeletion.state).toBe("failed");
    expect(retried.statusCode).toBe(200);
    const presigned = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${fileId}/presign`,
      headers: { cookie },
      payload: { contentHash: "a".repeat(64), byteSize: 1024 },
    });
    expect(presigned.statusCode).toBe(200);
    b2.storedObjects.set(storageKey, {
      sizeBytes: 1024,
      contentType: "image/jpeg",
    });
    await runObjectDeletionDrain({ database, b2, now: NOW });
    expect(b2.storedObjects.has(storageKey)).toBe(true);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toEqual([]);
  } finally {
    await context.close();
  }
});
