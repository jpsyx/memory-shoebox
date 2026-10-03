import { setUpUploadTestContext } from "./setUpUploadTestContext.ts";
import { describe, expect, it } from "vitest";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { createId } from "../../../../src/db/createId.ts";

import {
  insertMember,
  insertMilestone,
  insertPerson,
  insertTag,
  insertUploadBatchEdit,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/edits", () => {
  it("plans a new tag as one row and its targets, and creates no tag", async () => {
    const { database, sessionId, memberId, fileIds, postEdit, close } =
      await setUpUploadTestContext();

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
    const { database, fileIds, postEdit, close } =
      await setUpUploadTestContext();
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
    const { database, fileIds, postEdit, close } =
      await setUpUploadTestContext();
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
    const { fileIds, postEdit, close } = await setUpUploadTestContext();

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
    const { database, fileIds, postEdit, close } =
      await setUpUploadTestContext();
    const otherMemberId = await insertMember(database);
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
      state: "draft",
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
    expect(doubled.statusCode).toBe(201);
    expect(doubled.json<UploadBatchEditDto>().targetCount).toBe(1);
    expect(
      await database
        .selectFrom("upload_batch_edit_targets")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
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
    } = await setUpUploadTestContext({ state: "uploading", committed_at: NOW });
    const editId = await insertUploadBatchEdit({
      database: database,
      options: {
        uploadSessionId: sessionId,
        createdBy: memberId,
      },
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
});
