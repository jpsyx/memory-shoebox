import { describe, expect, it } from "vitest";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMilestone,
  insertPerson,
  insertTag,
  insertUploadBatchEdit,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const setUp = async (
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
) => {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
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
  const firstFileId = await insertUploadFile(testApp.database, {
    uploadSessionId: sessionId,
    position: 1,
  });
  const secondFileId = await insertUploadFile(testApp.database, {
    uploadSessionId: sessionId,
    position: 2,
  });
  const thirdFileId = await insertUploadFile(testApp.database, {
    uploadSessionId: sessionId,
    position: 3,
  });
  const postEdit = (payload: Record<string, unknown>) => {
    return testApp.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/edits`,
      headers: { cookie },
      payload,
    });
  };
  const deleteEdit = (editId: string) => {
    return testApp.app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}/edits/${editId}`,
      headers: { cookie },
    });
  };
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    fileIds: [firstFileId, secondFileId, thirdFileId],
    postEdit,
    deleteEdit,
  };
};

describe("POST /api/upload-sessions/:sessionId/edits", () => {
  it("plans a new tag as one row and its targets, and creates no tag", async () => {
    const { database, sessionId, memberId, fileIds, postEdit, close } =
      await setUp();

    const response = await postEdit({
      kind: "tag",
      targetFileIds: fileIds.slice(0, 2),
      labelSnapshot: "Hospital",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<UploadBatchEditDto>()).toMatchObject({
      kind: "tag",
      label: "Hospital",
      tag: null,
      person: null,
      milestone: null,
      targetCount: 2,
      createdAt: NOW,
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    });
    expect(await database.selectFrom("tags").selectAll().execute()).toEqual([]);
    expect(await database.selectFrom("people").selectAll().execute()).toEqual(
      [],
    );
    const edits = await database
      .selectFrom("upload_batch_edits")
      .selectAll()
      .execute();
    expect(edits).toEqual([
      expect.objectContaining({
        upload_session_id: sessionId,
        label_snapshot: "Hospital",
        tag_id: null,
        created_by: memberId,
      }),
    ]);
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

  it("reads each label from the row the edit names", async () => {
    const { database, fileIds, postEdit, close } = await setUp();
    const tagId = await insertTag(database, { name: "Beach" });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-14",
      endsOn: "2026-09-16",
    });

    const tagEdit = await postEdit({
      kind: "tag",
      targetFileIds: fileIds,
      tagId,
    });
    const personEdit = await postEdit({
      kind: "person",
      targetFileIds: fileIds,
      personId,
    });
    const milestoneEdit = await postEdit({
      kind: "milestone",
      targetFileIds: fileIds.slice(0, 1),
      milestoneId,
    });

    expect(tagEdit.json<UploadBatchEditDto>()).toMatchObject({
      label: "Beach",
      tag: { tagId, name: "Beach" },
      targetCount: 3,
    });
    expect(personEdit.json<UploadBatchEditDto>()).toMatchObject({
      label: "Mateo",
      person: { personId, displayName: "Mateo" },
    });
    expect(milestoneEdit.json<UploadBatchEditDto>()).toMatchObject({
      kind: "milestone",
      label: "Home from the hospital",
      milestone: {
        milestoneId,
        name: "Home from the hospital",
        startsOn: "2026-09-14",
        endsOn: "2026-09-16",
        blurb: null,
      },
      targetCount: 1,
    });
    await close();
  });

  it("refuses the bodies the modal would never send", async () => {
    const { database, fileIds, postEdit, close } = await setUp();
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-14",
    });

    const responses = [
      await postEdit({
        kind: "tag",
        targetFileIds: fileIds,
        tagId: createId(),
        labelSnapshot: "Hospital",
      }),
      await postEdit({
        kind: "milestone",
        targetFileIds: fileIds,
        milestoneId,
        labelSnapshot: "Home",
      }),
      await postEdit({ kind: "milestone", targetFileIds: fileIds }),
      await postEdit({
        kind: "tag",
        targetFileIds: fileIds,
        labelSnapshot: " ",
      }),
      await postEdit({
        kind: "tag",
        targetFileIds: [],
        labelSnapshot: "Hospital",
      }),
      await postEdit({
        kind: "tag",
        targetFileIds: fileIds,
        tagId: createId(),
      }),
    ];

    expect(
      responses.map((response) => {
        return [response.statusCode, response.json().error];
      }),
    ).toEqual(
      Array.from({ length: 6 }, () => {
        return [400, "invalid_request"];
      }),
    );
    expect(
      await database.selectFrom("upload_batch_edits").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("answers milestone_not_found for a milestone that does not exist", async () => {
    const { fileIds, postEdit, close } = await setUp();

    const response = await postEdit({
      kind: "milestone",
      targetFileIds: fileIds,
      milestoneId: createId(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("milestone_not_found");
    await close();
  });

  it("answers one 404 for a target outside this batch, and dedupes a double submit", async () => {
    const { database, memberId, fileIds, postEdit, close } = await setUp();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
      position: 1,
    });

    const forElsewhere = await postEdit({
      kind: "tag",
      targetFileIds: [...fileIds.slice(0, 1), elsewhereId],
      labelSnapshot: "Hospital",
    });
    const forNothing = await postEdit({
      kind: "tag",
      targetFileIds: [...fileIds.slice(0, 1), createId()],
      labelSnapshot: "Hospital",
    });
    const doubled = await postEdit({
      kind: "tag",
      targetFileIds: [...fileIds.slice(0, 1), ...fileIds.slice(0, 1)],
      labelSnapshot: "Hospital",
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    expect(doubled.json<UploadBatchEditDto>().targetCount).toBe(1);
    await close();
  });

  it("freezes at commit, for adding and for undoing", async () => {
    const {
      database,
      sessionId,
      memberId,
      fileIds,
      postEdit,
      deleteEdit,
      close,
    } = await setUp({ state: "uploading", committed_at: NOW });
    const editId = await insertUploadBatchEdit(database, {
      uploadSessionId: sessionId,
      createdBy: memberId,
    });

    const added = await postEdit({
      kind: "tag",
      targetFileIds: fileIds,
      labelSnapshot: "Hospital",
    });
    const undone = await deleteEdit(editId);

    expect(added.statusCode).toBe(409);
    expect(added.json().error).toBe("upload_session_conflict");
    expect(undone.statusCode).toBe(409);
    expect(undone.json().error).toBe("upload_session_conflict");
    await close();
  });

  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, fileIds, close } = await setUp();
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

describe("DELETE /api/upload-sessions/:sessionId/edits/:editId", () => {
  it("undoes an edit once, and keeps the row and its targets", async () => {
    const { database, fileIds, postEdit, deleteEdit, close } = await setUp();
    const created = await postEdit({
      kind: "tag",
      targetFileIds: fileIds.slice(0, 2),
      labelSnapshot: "Hospital",
    });
    const editId = created.json<UploadBatchEditDto>().editId;

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
    await close();
  });

  it("will not undo an edit that has already been applied", async () => {
    const { database, sessionId, memberId, deleteEdit, close } = await setUp();
    const editId = await insertUploadBatchEdit(database, {
      uploadSessionId: sessionId,
      createdBy: memberId,
      applied_at: NOW,
    });

    const response = await deleteEdit(editId);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_edit_conflict");
    await close();
  });

  it("answers one 404 for an edit from another batch", async () => {
    const { database, memberId, deleteEdit, close } = await setUp();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });
    const elsewhereId = await insertUploadBatchEdit(database, {
      uploadSessionId: otherSessionId,
      createdBy: memberId,
    });

    const forElsewhere = await deleteEdit(elsewhereId);
    const forNothing = await deleteEdit(createId());

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_edit_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    await close();
  });
});
