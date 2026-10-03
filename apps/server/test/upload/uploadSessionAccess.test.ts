/** The migrated catalog and viewers used to check session access. */
type AccessTestContext = {
  database: ReturnType<typeof createDatabase>;
  sessionId: string;
  owner: ReturnType<typeof makeViewer>;
  other: ReturnType<typeof makeViewer>;
  admin: ReturnType<typeof makeViewer>;
};
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import {
  assertMayUpload,
  getOpenUploadSessionIdFromMemberId,
  getOwnUploadSessionFromSessionIdOr404,
  getReadableUploadSessionFromSessionIdOr404,
  getUploadFileFromFileIdOr404,
} from "../../src/upload/uploadSessionAccessHelpers.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** Two uploaders, an admin, and one session belonging to the first. */
async function _createContext(): Promise<AccessTestContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const ownerId = await insertMember(database);
  const otherId = await insertMember(database);
  const adminId = await insertMember(database, { role: "admin" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: ownerId,
  });
  return {
    database,
    sessionId,
    owner: makeViewer({ memberId: ownerId }),
    other: makeViewer({ memberId: otherId }),
    admin: makeViewer({ memberId: adminId, role: "admin", isAdmin: true }),
  };
}

/** Whatever a lookup threw, so two refusals can be compared field by field. */
async function _getRefusal(lookup: Promise<unknown>): Promise<ApiError> {
  return lookup.then(
    () => {
      throw new Error("expected the lookup to refuse");
    },
    (error: unknown) => {
      return error as ApiError;
    },
  );
}

describe("getOwnUploadSessionOr404", () => {
  it("returns the uploader's own session", async () => {
    const { database, sessionId, owner } = await _createContext();

    const session = await getOwnUploadSessionFromSessionIdOr404({
      database,
      viewer: owner,
      sessionId,
    });

    expect(session.id).toBe(sessionId);
    expect(session.uploaded_by).toBe(owner.memberId);
    await database.destroy();
  });

  it("is one 404 for another member's session, an admin's included, and for no session", async () => {
    const { database, sessionId, other, admin } = await _createContext();

    const forOther = await _getRefusal(
      getOwnUploadSessionFromSessionIdOr404({
        database,
        viewer: other,
        sessionId,
      }),
    );
    const forAdmin = await _getRefusal(
      getOwnUploadSessionFromSessionIdOr404({
        database,
        viewer: admin,
        sessionId,
      }),
    );
    const forNothing = await _getRefusal(
      getOwnUploadSessionFromSessionIdOr404({
        database,
        viewer: other,
        sessionId: createId(),
      }),
    );

    expect(forOther).toBeInstanceOf(ApiError);
    expect(forOther.statusCode).toBe(404);
    expect(forOther.code).toBe("upload_session_not_found");
    expect({ ...forOther, message: forOther.message }).toEqual({
      ...forNothing,
      message: forNothing.message,
    });
    expect({ ...forAdmin }).toEqual({ ...forNothing });
    await database.destroy();
  });
});

describe("getReadableUploadSessionOr404", () => {
  it("lets the uploader and any admin read it", async () => {
    const { database, sessionId, owner, admin } = await _createContext();

    await expect(
      getReadableUploadSessionFromSessionIdOr404({
        database,
        viewer: owner,
        sessionId,
      }),
    ).resolves.toMatchObject({ id: sessionId });
    await expect(
      getReadableUploadSessionFromSessionIdOr404({
        database,
        viewer: admin,
        sessionId,
      }),
    ).resolves.toMatchObject({ id: sessionId });
    await database.destroy();
  });

  it("is the same 404 for another uploader as for no session", async () => {
    const { database, sessionId, other } = await _createContext();

    const forOther = await _getRefusal(
      getReadableUploadSessionFromSessionIdOr404({
        database,
        viewer: other,
        sessionId,
      }),
    );
    const forNothing = await _getRefusal(
      getReadableUploadSessionFromSessionIdOr404({
        database,
        viewer: other,
        sessionId: createId(),
      }),
    );

    expect(forOther.code).toBe("upload_session_not_found");
    expect({ ...forOther, message: forOther.message }).toEqual({
      ...forNothing,
      message: forNothing.message,
    });
    await database.destroy();
  });
});

describe("getUploadFileOr404", () => {
  it("returns a file of this session", async () => {
    const { database, sessionId } = await _createContext();
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
    });

    await expect(
      getUploadFileFromFileIdOr404({ database, sessionId, fileId }),
    ).resolves.toMatchObject({ id: fileId, upload_session_id: sessionId });
    await database.destroy();
  });

  it("is the same 404 for another session's file as for no file", async () => {
    const { database, sessionId, other } = await _createContext();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: other.memberId,
    });
    const otherFileId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
    });

    const forOther = await _getRefusal(
      getUploadFileFromFileIdOr404({
        database,
        sessionId,
        fileId: otherFileId,
      }),
    );
    const forNothing = await _getRefusal(
      getUploadFileFromFileIdOr404({ database, sessionId, fileId: createId() }),
    );

    expect(forOther.statusCode).toBe(404);
    expect(forOther.code).toBe("upload_file_not_found");
    expect({ ...forOther, message: forOther.message }).toEqual({
      ...forNothing,
      message: forNothing.message,
    });
    await database.destroy();
  });
});

describe("assertMayUpload", () => {
  it("lets an uploader and an admin through", () => {
    expect(() => {
      assertMayUpload(makeViewer({ memberId: createId() }));
    }).not.toThrow();
    expect(() => {
      assertMayUpload(
        makeViewer({ memberId: createId(), role: "admin", isAdmin: true }),
      );
    }).not.toThrow();
  });

  it("refuses a viewer with 403 upload_forbidden", () => {
    const refusal = (() => {
      try {
        assertMayUpload(makeViewer({ memberId: createId(), role: "viewer" }));
        return undefined;
      } catch (caught: unknown) {
        return caught as ApiError;
      }
    })();

    expect(refusal?.statusCode).toBe(403);
    expect(refusal?.code).toBe("upload_forbidden");
  });
});

describe("getOpenUploadSessionIdFromMemberId", () => {
  it("finds a draft, and nothing terminal", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });

    expect(
      await getOpenUploadSessionIdFromMemberId({ database, memberId }),
    ).toBeUndefined();

    const draftId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      created_at: shiftMinutes({ instant: NOW, minutes: 5 }),
    });

    expect(
      await getOpenUploadSessionIdFromMemberId({ database, memberId }),
    ).toBe(draftId);
    await database.destroy();
  });

  it("finds an uploading session for its owner too", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadingId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "uploading",
    });

    expect(
      await getOpenUploadSessionIdFromMemberId({ database, memberId }),
    ).toBe(uploadingId);
    await database.destroy();
  });

  it("answers with the newer of two open sessions, by created_at", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    // The newer one is inserted first, so its id sorts below the older
    // one's: only `created_at` can put it on top.
    const newerId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      created_at: shiftMinutes({ instant: NOW, minutes: 5 }),
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "uploading",
      created_at: NOW,
    });

    expect(
      await getOpenUploadSessionIdFromMemberId({ database, memberId }),
    ).toBe(newerId);
    await database.destroy();
  });

  it("never answers with another member's session", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const otherId = await insertMember(database);
    await insertUploadSession(database, { uploadedBy: otherId });

    expect(
      await getOpenUploadSessionIdFromMemberId({ database, memberId }),
    ).toBeUndefined();
    await database.destroy();
  });
});
