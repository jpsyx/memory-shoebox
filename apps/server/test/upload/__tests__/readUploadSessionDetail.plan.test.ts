import { describe, expect, it } from "vitest";
import {
  insertItem,
  insertItemMilestone,
  insertMilestone,
  insertTag,
  insertUploadBatchEdit,
  insertUploadBatchEditTargets,
  NOW,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDetailContext,
  insertManifestFile,
  readDetail,
} from "./readUploadSessionDetailTestHelpers.ts";

describe("readUploadSessionDetail: the days", () => {
  it("groups the manifest by the day each file will land on, earliest first", async () => {
    const context = await createDetailContext();
    await insertManifestFile(context, { position: 0 });
    await insertManifestFile(context, { position: 1 });
    await insertManifestFile(context, {
      position: 2,
      captureDate: "2026-09-15",
    });
    // Neither of these ever lands, so neither is on a day.
    await insertManifestFile(context, {
      position: 3,
      captureDate: "2026-09-15",
      overrides: { state: "refused", problem_code: "unsupported_type" },
    });
    await insertManifestFile(context, {
      position: 4,
      captureDate: "2026-09-15",
      overrides: { state: "cancelled" },
    });
    // A failed file can still be retried, so it keeps its day.
    await insertManifestFile(context, {
      position: 5,
      captureDate: "2026-09-16",
      overrides: { state: "failed", problem_code: "connection_lost" },
    });
    await insertManifestFile(context, { position: 6, captureDate: null });

    const detail = await readDetail(context);

    expect(detail.days).toEqual([
      { capturedOn: "2026-09-14", fileCount: 2, milestones: [] },
      { capturedOn: "2026-09-15", fileCount: 1, milestones: [] },
      { capturedOn: "2026-09-16", fileCount: 1, milestones: [] },
    ]);
    await context.database.destroy();
  });

  it("takes a day's milestones from the plan before ingest and item_milestones after", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const hospitalId = await insertMilestone(context.database, {
      name: "Hospital week",
      startsOn: "2026-09-15",
      endsOn: "2026-09-20",
    });
    const undoneId = await insertMilestone(context.database, {
      name: "Never mind",
      startsOn: "2026-09-14",
    });
    const waitingId = await insertManifestFile(context, { position: 0 });
    const itemId = await insertItem(context.database, {
      uploadedBy: context.memberId,
      upload_session_id: context.sessionId,
      captured_on: "2026-09-15",
    });
    const landedId = await insertManifestFile(context, {
      position: 1,
      captureDate: "2026-09-15",
      overrides: { state: "done", item_id: itemId },
    });
    await insertItemMilestone(context.database, {
      itemId,
      milestoneId: hospitalId,
    });
    // The plan also names Birthday for the landed file, but that file is an
    // item now, so what counts for it is `item_milestones`.
    const birthdayEdit = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "milestone",
      milestone_id: birthdayId,
      label_snapshot: null,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId: birthdayEdit,
      fileIds: [waitingId, landedId],
    });
    const undoneEdit = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "milestone",
      milestone_id: undoneId,
      label_snapshot: null,
      undone_at: NOW,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId: undoneEdit,
      fileIds: [waitingId],
    });

    const detail = await readDetail(context);

    expect(
      detail.days.map((day) => {
        return [
          day.capturedOn,
          day.milestones.map((milestone) => {
            return milestone.name;
          }),
        ];
      }),
    ).toEqual([
      ["2026-09-14", ["Birthday"]],
      ["2026-09-15", ["Hospital week"]],
    ]);
    await context.database.destroy();
  });

  it("keys the plan on the file's state, so a deleted item's milestone does not come back", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const itemId = await insertItem(context.database, {
      uploadedBy: context.memberId,
      upload_session_id: context.sessionId,
      captured_on: "2026-09-14",
    });
    const landedId = await insertManifestFile(context, {
      position: 0,
      overrides: { state: "done", item_id: itemId },
    });
    const editId = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "milestone",
      milestone_id: birthdayId,
      label_snapshot: null,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId,
      fileIds: [landedId],
    });
    await insertItemMilestone(context.database, {
      itemId,
      milestoneId: birthdayId,
    });
    // `upload_files.item_id` is ON DELETE SET NULL, so the done file now
    // looks like a manifest row that never became an item.
    await context.database
      .deleteFrom("items")
      .where("id", "=", itemId)
      .execute();

    const detail = await readDetail(context);

    const deletedFile = await context.database
      .selectFrom("upload_files")
      .select(["state", "item_id"])
      .where("id", "=", landedId)
      .executeTakeFirstOrThrow();
    expect(deletedFile).toEqual({ state: "done", item_id: null });
    expect(detail.days).toEqual([
      { capturedOn: "2026-09-14", fileCount: 1, milestones: [] },
    ]);
    await context.database.destroy();
  });
});

describe("readUploadSessionDetail: the edit plan", () => {
  it("lists what is planned, oldest first, without what was undone", async () => {
    const context = await createDetailContext();
    const first = await insertManifestFile(context, { position: 0 });
    const second = await insertManifestFile(context, { position: 1 });
    const beachId = await insertTag(context.database, { name: "Beach" });
    const typed = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId: typed,
      fileIds: [first, second],
    });
    const picked = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      tag_id: beachId,
      label_snapshot: null,
      created_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    await insertUploadBatchEditTargets(context.database, {
      editId: picked,
      fileIds: [second],
    });
    const undone = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "person",
      label_snapshot: "Mateo",
      undone_at: NOW,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId: undone,
      fileIds: [first],
    });

    const detail = await readDetail(context);

    expect(
      detail.edits.map((edit) => {
        return {
          editId: edit.editId,
          label: edit.label,
          tag: edit.tag,
          targetCount: edit.targetCount,
          canUndo: edit.canUndo,
        };
      }),
    ).toEqual([
      {
        editId: typed,
        label: "Hospital",
        tag: null,
        targetCount: 2,
        canUndo: true,
      },
      {
        editId: picked,
        label: "Beach",
        tag: { tagId: beachId, name: "Beach" },
        targetCount: 1,
        canUndo: true,
      },
    ]);
    await context.database.destroy();
  });

  it("says nothing can be undone once the batch is committed", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const fileId = await insertManifestFile(context, { position: 0 });
    const editId = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId,
      fileIds: [fileId],
    });

    const detail = await readDetail(context);

    expect(detail.edits[0]?.canUndo).toBe(false);
    await context.database.destroy();
  });
});

describe("readUploadSessionDetail: mismatches and the undated", () => {
  it("names the files captured outside their milestone's span", async () => {
    const context = await createDetailContext();
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const inside = await insertManifestFile(context, { position: 0 });
    const after = await insertManifestFile(context, {
      position: 1,
      captureDate: "2026-09-16",
    });
    const before = await insertManifestFile(context, {
      position: 2,
      captureDate: "2026-09-13",
    });
    const refused = await insertManifestFile(context, {
      position: 3,
      captureDate: "2026-09-20",
      overrides: { state: "refused", problem_code: "unsupported_type" },
    });
    const editId = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "milestone",
      milestone_id: birthdayId,
      label_snapshot: null,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId,
      fileIds: [inside, after, before, refused],
    });

    const detail = await readDetail(context);

    expect(detail.mismatches).toEqual([
      {
        milestone: {
          milestoneId: birthdayId,
          name: "Birthday",
          startsOn: "2026-09-14",
          endsOn: "2026-09-14",
          blurb: null,
        },
        files: [
          {
            fileId: after,
            originalFilename: "IMG_0001.jpg",
            capturedOn: "2026-09-16",
          },
          {
            fileId: before,
            originalFilename: "IMG_0002.jpg",
            capturedOn: "2026-09-13",
          },
        ],
      },
    ]);
    await context.database.destroy();
  });

  it("names nothing for a milestone edit that was undone", async () => {
    const context = await createDetailContext();
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const outside = await insertManifestFile(context, {
      position: 0,
      captureDate: "2026-09-20",
    });
    const editId = await insertUploadBatchEdit(context.database, {
      uploadSessionId: context.sessionId,
      createdBy: context.memberId,
      kind: "milestone",
      milestone_id: birthdayId,
      label_snapshot: null,
      undone_at: NOW,
    });
    await insertUploadBatchEditTargets(context.database, {
      editId,
      fileIds: [outside],
    });

    expect((await readDetail(context)).mismatches).toEqual([]);
    await context.database.destroy();
  });

  it("groups the files that did not say when they were taken", async () => {
    const context = await createDetailContext();
    await insertManifestFile(context, { position: 0 });
    const saved = await insertManifestFile(context, {
      position: 1,
      captureDate: "2026-09-20",
      overrides: { capture_source: "file_mtime" },
    });
    const silent = await insertManifestFile(context, {
      position: 2,
      captureDate: "2026-09-27",
      overrides: { capture_source: "upload_time" },
    });

    const detail = await readDetail(context);

    expect(detail.undated).toEqual({
      fileCount: 2,
      captureSource: "upload_time",
      files: [
        {
          fileId: saved,
          originalFilename: "IMG_0001.jpg",
          capturedOn: "2026-09-20",
        },
        {
          fileId: silent,
          originalFilename: "IMG_0002.jpg",
          capturedOn: "2026-09-27",
        },
      ],
    });
    await context.database.destroy();
  });

  it("has no undated group when every file said", async () => {
    const context = await createDetailContext();
    await insertManifestFile(context, { position: 0 });

    expect((await readDetail(context)).undated).toBeNull();
    await context.database.destroy();
  });
});
