import {
  AMENDED_AT,
  makeHash,
  makeEntry,
  readFiles,
  setUpUploadTestContext,
} from "./uploadManifestTestHelpers.ts";

import { describe, expect, it } from "vitest";
import {
  UPLOAD_LIMITS,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";

import { createId } from "../../../../src/db/createId.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("PATCH /api/upload-sessions/:sessionId/manifest", () => {
  it("is closed to new files after commit, and to amending a file in flight", async () => {
    const { database, sessionId, patchManifest, close } =
      await setUpUploadTestContext({
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
    const unchanged = await readFiles({
      database: database,
      sessionId: sessionId,
    });
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
    const { patchManifest, close } = await setUpUploadTestContext({
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
    const { database, memberId, patchManifest, close } =
      await setUpUploadTestContext();
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

  it("takes a full request of the manifest page size, new and then amended", async () => {
    const { patchManifest, close } = await setUpUploadTestContext();
    const entries = Array.from(
      { length: UPLOAD_LIMITS.manifestEntriesPerRequest },
      (_unused, index) => {
        return makeEntry({
          clientRef: `c${index}`,
          contentHash: makeHash(`c${index}`),
        });
      },
    );

    const created = await patchManifest(entries);

    expect(created.statusCode).toBe(200);
    const createdBody = created.json<PutUploadManifestResponse>();
    expect(createdBody.fileCount).toBe(UPLOAD_LIMITS.manifestEntriesPerRequest);

    // The widest statements: every row amended in one `UPDATE ... FROM`.
    const amended = await patchManifest(
      createdBody.outcomes.map((outcome, index) => {
        return makeEntry({
          clientRef: `c${index}`,
          fileId: outcome.fileId,
          capturedAt: AMENDED_AT,
        });
      }),
    );

    expect(amended.statusCode).toBe(200);
    expect(
      new Set(
        amended.json<PutUploadManifestResponse>().outcomes.map((outcome) => {
          return outcome.disposition;
        }),
      ),
    ).toEqual(new Set(["amended"]));
    await close();
  });

  it("caps one request at the manifest page size", async () => {
    const { patchManifest, close } = await setUpUploadTestContext();

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
    const { app, database, sessionId, close } = await setUpUploadTestContext();
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
    const send = (
      functionOptions: Readonly<{ sessionIdToSend: string; cookie: string }>,
    ) => {
      const { sessionIdToSend, cookie } = functionOptions;

      return app.inject({
        method: "PATCH",
        url: `/api/upload-sessions/${sessionIdToSend}/manifest`,
        headers: { cookie },
        payload: { files: [makeEntry({ clientRef: "a" })] },
      });
    };

    const forOther = await send({
      sessionIdToSend: sessionId,
      cookie: otherCookie,
    });
    const forAdmin = await send({
      sessionIdToSend: sessionId,
      cookie: adminCookie,
    });
    const forNothing = await send({
      sessionIdToSend: createId(),
      cookie: otherCookie,
    });
    const forViewer = await send({
      sessionIdToSend: viewerSessionId,
      cookie: viewer.cookie,
    });

    expect(forOther.statusCode).toBe(404);
    expect(forOther.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forOther.body);
    expect(forNothing.body).toBe(forOther.body);
    expect(forViewer.statusCode).toBe(403);
    expect(forViewer.json().error).toBe("upload_forbidden");
    await close();
  });
});
