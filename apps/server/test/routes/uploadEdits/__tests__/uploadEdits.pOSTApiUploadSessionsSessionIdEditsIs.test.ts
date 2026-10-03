import { setUpUploadTestContext } from "./setUpUploadTestContext.ts";
import { describe, expect, it } from "vitest";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { createId } from "../../../../src/db/createId.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadBatchEdit,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/edits", () => {
  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, fileIds, close } =
      await setUpUploadTestContext();
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
        method: "POST",
        url: `/api/upload-sessions/${sessionIdToSend}/edits`,
        headers: { cookie },
        payload: {
          kind: "tag",
          targetFileIds: fileIds,
          labelSnapshot: "Hospital",
        },
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

describe("DELETE /api/upload-sessions/:sessionId/edits/:editId", () => {
  it("undoes an edit once, and keeps the row and its targets", async () => {
    const { database, sessionId, fileIds, postEdit, deleteEdit, close } =
      await setUpUploadTestContext();
    const created = await postEdit({
      kind: "tag",
      targetFileIds: fileIds.slice(0, 2),
      labelSnapshot: "Hospital",
    });
    const editId = created.json<UploadBatchEditDto>().editId;
    await database
      .updateTable("upload_sessions")
      .set({ last_activity_at: shiftMinutes({ instant: NOW, minutes: -10 }) })
      .where("id", "=", sessionId)
      .execute();

    const undone = await deleteEdit(editId);
    const again = await deleteEdit(editId);

    expect(undone.statusCode).toBe(200);
    expect(undone.json<UploadBatchEditDto>()).toMatchObject({
      editId,
      undoneAt: NOW,
      canUndo: false,
      targetCount: 2,
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("upload_edit_conflict");
    expect(
      await database
        .selectFrom("upload_batch_edit_targets")
        .selectAll()
        .execute(),
    ).toHaveLength(2);
    const session = await database
      .selectFrom("upload_sessions")
      .select("last_activity_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_activity_at).toBe(NOW);
    await close();
  });

  it("will not undo an edit that has already been applied", async () => {
    const { database, sessionId, memberId, deleteEdit, close } =
      await setUpUploadTestContext();
    const editId = await insertUploadBatchEdit({
      database: database,
      options: {
        uploadSessionId: sessionId,
        createdBy: memberId,
        applied_at: NOW,
      },
    });

    const response = await deleteEdit(editId);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_edit_conflict");
    await close();
  });

  it("answers one 404 for an edit from another batch", async () => {
    const { database, memberId, deleteEdit, close } =
      await setUpUploadTestContext();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });
    const elsewhereId = await insertUploadBatchEdit({
      database: database,
      options: {
        uploadSessionId: otherSessionId,
        createdBy: memberId,
      },
    });

    const forElsewhere = await deleteEdit(elsewhereId);
    const forNothing = await deleteEdit(createId());

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_edit_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    await close();
  });
});
