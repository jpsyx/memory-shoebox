import { describe, expect, it } from "vitest";
import {
  insertMilestone,
  insertUploadBatchEdit,
  insertUploadBatchEditTargets,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDetailContext,
  insertManifestFile,
  readDetail,
} from "./readUploadSessionDetailTestHelpers.ts";

describe("readUploadSessionDetail: mismatches and the undated", () => {
  it("names the files captured outside their milestone's span", async () => {
    const context = await createDetailContext();
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const inside = await insertManifestFile({
      context: context,
      options: { position: 0 },
    });
    const after = await insertManifestFile({
      context: context,
      options: {
        position: 1,
        captureDate: "2026-09-16",
      },
    });
    const before = await insertManifestFile({
      context: context,
      options: {
        position: 2,
        captureDate: "2026-09-13",
      },
    });
    const refused = await insertManifestFile({
      context: context,
      options: {
        position: 3,
        captureDate: "2026-09-20",
        overrides: { state: "refused", problem_code: "unsupported_type" },
      },
    });
    const editId = await insertUploadBatchEdit({
      database: context.database,
      options: {
        uploadSessionId: context.sessionId,
        createdBy: context.memberId,
        kind: "milestone",
        milestone_id: birthdayId,
        label_snapshot: null,
      },
    });
    await insertUploadBatchEditTargets({
      database: context.database,
      options: {
        editId,
        fileIds: [inside, after, before, refused],
      },
    });

    const detail = await readDetail({ context: context });

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
    const outside = await insertManifestFile({
      context: context,
      options: {
        position: 0,
        captureDate: "2026-09-20",
      },
    });
    const editId = await insertUploadBatchEdit({
      database: context.database,
      options: {
        uploadSessionId: context.sessionId,
        createdBy: context.memberId,
        kind: "milestone",
        milestone_id: birthdayId,
        label_snapshot: null,
        undone_at: NOW,
      },
    });
    await insertUploadBatchEditTargets({
      database: context.database,
      options: {
        editId,
        fileIds: [outside],
      },
    });

    expect((await readDetail({ context: context })).mismatches).toEqual([]);
    await context.database.destroy();
  });

  it("groups the files that did not say when they were taken", async () => {
    const context = await createDetailContext();
    await insertManifestFile({ context: context, options: { position: 0 } });
    const saved = await insertManifestFile({
      context: context,
      options: {
        position: 1,
        captureDate: "2026-09-20",
        overrides: { capture_source: "file_mtime" },
      },
    });
    const silent = await insertManifestFile({
      context: context,
      options: {
        position: 2,
        captureDate: "2026-09-27",
        overrides: { capture_source: "upload_time" },
      },
    });

    const detail = await readDetail({ context: context });

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
    await insertManifestFile({ context: context, options: { position: 0 } });

    expect((await readDetail({ context: context })).undated).toBeNull();
    await context.database.destroy();
  });
});
