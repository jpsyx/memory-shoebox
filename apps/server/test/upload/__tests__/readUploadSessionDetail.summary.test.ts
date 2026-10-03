import { uploadSessionDetailSchema } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { readUploadProgress } from "../../../src/upload/readUploadSessionDetailHelpers.ts";
import {
  insertBurst,
  insertItem,
  insertItemMilestone,
  insertMilestone,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDetailContext,
  insertManifestFile,
  readDetail,
  type DetailContext,
} from "./readUploadSessionDetailTestHelpers.ts";

/** One landed file: an item of this session, and the done row behind it. */
async function _insertLandedFile(
  functionOptions: Readonly<{
    context: Readonly<DetailContext>;
    options: { position: number; capturedOn: string; burstId?: string };
  }>,
): Promise<string> {
  const { context, options } = functionOptions;

  const itemId = await insertItem(context.database, {
    uploadedBy: context.memberId,
    upload_session_id: context.sessionId,
    seq: options.position,
    captured_on: options.capturedOn,
    burst_id: options.burstId ?? null,
    burst_index: options.burstId === undefined ? null : options.position + 1,
  });
  await insertManifestFile({
    context: context,
    options: {
      position: options.position,
      captureDate: options.capturedOn,
      overrides: { state: "done", item_id: itemId, declared_bytes: 1000 },
    },
  });
  return itemId;
}

describe("readUploadSessionDetail: the batch itself", () => {
  it("describes a fresh draft through the contract's own schema", async () => {
    const context = await createDetailContext();

    const detail = await readDetail({ context: context });

    expect(uploadSessionDetailSchema.parse(detail)).toEqual(detail);
    expect(detail).toMatchObject({
      sessionId: context.sessionId,
      state: "draft",
      uploadedBy: { memberId: context.memberId, displayName: "Papá" },
      visibility: { visibilityRuleId: "visibility-rule-everyone" },
      clientTimezone: "Europe/Madrid",
      fileCount: 0,
      totalBytes: 0,
      committedAt: null,
      days: [],
      edits: [],
      mismatches: [],
      undated: null,
      pendingFiles: [],
      summary: null,
      files: [],
      nextCursor: null,
    });
    await context.database.destroy();
  });
});

describe("readUploadProgress", () => {
  it("counts the files by state, and only whole landed files' bytes", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const states = [
      ["waiting", 100],
      ["waiting", 100],
      ["sending", 100],
      ["done", 1000],
      ["done", 2000],
      ["failed", 100],
      ["refused", 100],
      ["cancelled", 100],
    ] as const;
    await Promise.all(
      states.map(([state, declaredBytes], position) => {
        return insertManifestFile({
          context: context,
          options: {
            position,
            overrides: { state, declared_bytes: declaredBytes },
          },
        });
      }),
    );

    const progress = await readUploadProgress({
      database: context.database,
      sessionId: context.sessionId,
    });

    expect(progress).toEqual({
      waitingCount: 2,
      sendingCount: 1,
      doneCount: 2,
      failedCount: 1,
      refusedCount: 1,
      cancelledCount: 1,
      doneBytes: 3000,
    });
    expect((await readDetail({ context: context })).progress).toEqual(progress);
    await context.database.destroy();
  });
});

describe("readUploadSessionDetail: the done state", () => {
  it("has no summary until the batch settles", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    await _insertLandedFile({
      context: context,
      options: { position: 0, capturedOn: "2026-09-14" },
    });

    expect((await readDetail({ context: context })).summary).toBeNull();
    await context.database.destroy();
  });

  it("counts what landed once it has settled, computed on read", async () => {
    const context = await createDetailContext({
      state: "settled",
      committed_at: NOW,
      settled_at: NOW,
      notified_at: NOW,
      notified_member_count: 7,
    });
    const burstId = await insertBurst(context.database, {
      uploadSessionId: context.sessionId,
      capturedOn: "2026-09-14",
    });
    const birthdayId = await insertMilestone(context.database, {
      name: "Birthday",
      startsOn: "2026-09-14",
    });
    const hospitalId = await insertMilestone(context.database, {
      name: "Hospital week",
      startsOn: "2026-09-15",
    });
    const first = await _insertLandedFile({
      context: context,
      options: {
        position: 0,
        capturedOn: "2026-09-14",
        burstId,
      },
    });
    const second = await _insertLandedFile({
      context: context,
      options: {
        position: 1,
        capturedOn: "2026-09-14",
        burstId,
      },
    });
    const third = await _insertLandedFile({
      context: context,
      options: {
        position: 2,
        capturedOn: "2026-09-15",
      },
    });
    await insertManifestFile({
      context: context,
      options: {
        position: 3,
        overrides: { state: "failed", problem_code: "connection_lost" },
      },
    });
    await insertItemMilestone(context.database, {
      itemId: first,
      milestoneId: birthdayId,
    });
    await insertItemMilestone(context.database, {
      itemId: second,
      milestoneId: birthdayId,
    });
    await insertItemMilestone(context.database, {
      itemId: third,
      milestoneId: hospitalId,
    });

    const detail = await readDetail({ context: context });

    expect(detail.summary).toEqual({
      itemCount: 3,
      dayCount: 2,
      milestoneCount: 2,
      burstCount: 1,
      burstFrameCount: 2,
      notifiedMemberCount: 7,
    });
    expect(uploadSessionDetailSchema.parse(detail).state).toBe("settled");
    await context.database.destroy();
  });
});
