import { HASH, setUpUploadTestContext } from "./uploadPresignTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { createId } from "../../../../src/db/createId.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/presign", () => {
  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, seedFile, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({ position: 1 });
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
    });
    const viewerFileId = await insertUploadFile(database, {
      uploadSessionId: viewerSessionId,
    });
    const send = (
      functionOptions: Readonly<{
        sessionIdToSend: string;
        fileIdToSend: string;
        cookie: string;
      }>,
    ) => {
      const { sessionIdToSend, fileIdToSend, cookie } = functionOptions;

      return app.inject({
        method: "POST",
        url: `/api/upload-sessions/${sessionIdToSend}/files/${fileIdToSend}/presign`,
        headers: { cookie },
        payload: { contentHash: HASH, byteSize: 1024 },
      });
    };

    const forOther = await send({
      sessionIdToSend: sessionId,
      fileIdToSend: fileId,
      cookie: otherCookie,
    });
    const forAdmin = await send({
      sessionIdToSend: sessionId,
      fileIdToSend: fileId,
      cookie: adminCookie,
    });
    const forNothing = await send({
      sessionIdToSend: createId(),
      fileIdToSend: fileId,
      cookie: otherCookie,
    });
    const forViewer = await send({
      sessionIdToSend: viewerSessionId,
      fileIdToSend: viewerFileId,
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
