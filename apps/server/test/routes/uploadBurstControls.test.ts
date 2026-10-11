import { describe, expect, it, onTestFinished } from "vitest";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { settleUploadSession } from "../../src/upload/settleUploadSession.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _makeContext() {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  onTestFinished(context.close);
  const owner = await insertSignedInMember({
    database: context.database,
    member: { role: "uploader" },
  });
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: owner.memberId,
    state: "draft",
    committed_at: null,
  });
  const fileIds = await Promise.all(
    [1, 2, 3].map((position) => {
      return insertUploadFile(context.database, {
        uploadSessionId: sessionId,
        position,
        capture_date: "2026-09-14",
        captured_at: `2026-09-14T06:41:0${position}.000Z`,
        capture_source: "exif",
      });
    }),
  );
  const patch = (fileId: string, excluded: boolean, cookie = owner.cookie) => {
    return context.app.inject({
      method: "PATCH",
      url: `/api/upload-sessions/${sessionId}/files/${fileId}/burst`,
      headers: { cookie },
      payload: { excluded },
    });
  };
  const read = (suffix = "") => {
    return context.app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}${suffix}`,
      headers: { cookie: owner.cookie },
    });
  };
  return { ...context, owner, sessionId, fileIds, patch, read };
}

describe("upload burst choices", () => {
  it("detects the full manifest across pagination and keeps the group identity through exclusions", async () => {
    const context = await _makeContext();
    const page = await context.read("?limit=1");
    const group = page.json().files[0].burst;
    expect(group).toMatchObject({ photoCount: 3, isExcluded: false });
    const response = await context.patch(context.fileIds[1]!, true);
    expect(response.statusCode).toBe(200);
    expect(response.json().files[1].burst).toEqual({
      ...group,
      photoCount: 2,
      isExcluded: true,
    });
    const reloaded = await context.read();
    expect(
      reloaded.json().files.map((file: { burst: unknown }) => {
        return file.burst;
      }),
    ).toEqual([
      { ...group, photoCount: 2 },
      { ...group, photoCount: 2, isExcluded: true },
      { ...group, photoCount: 2 },
    ]);
    const restored = await context.patch(context.fileIds[1]!, false);
    expect(
      restored.json().files.map((file: { burst: unknown }) => {
        return file.burst;
      }),
    ).toEqual([group, group, group]);
  });

  it("persists exclusions through settlement, including a fully excluded group, and restores through upload", async () => {
    const context = await _makeContext();
    for (const fileId of context.fileIds) {
      expect((await context.patch(fileId, true)).statusCode).toBe(200);
    }
    const itemIds = await Promise.all(
      context.fileIds.map(async (fileId, index) => {
        const itemId = await insertItem(context.database, {
          uploadedBy: context.owner.memberId,
          upload_session_id: context.sessionId,
          seq: index + 1,
          captured_on: "2026-09-14",
          captured_at: `2026-09-14T06:41:0${index + 1}.000Z`,
          capture_source: "exif",
        });
        await insertRendition(context.database, { itemId });
        await context.database
          .updateTable("upload_files")
          .set({ state: "done", item_id: itemId })
          .where("id", "=", fileId)
          .execute();
        return itemId;
      }),
    );
    await context.database
      .updateTable("upload_sessions")
      .set({ committed_at: NOW, state: "uploading" })
      .where("id", "=", context.sessionId)
      .execute();
    await runInImmediateTransaction({
      database: context.database,
      callback: (transaction) => {
        return settleUploadSession({
          transaction,
          sessionId: context.sessionId,
          now: NOW,
        });
      },
    });
    expect(
      await context.database.selectFrom("bursts").selectAll().execute(),
    ).toEqual([]);
    const settled = await context.read();
    expect(
      settled.json().files.every((file: { burst: { isExcluded: boolean } }) => {
        return file.burst.isExcluded;
      }),
    ).toBe(true);
    for (const fileId of context.fileIds) {
      expect((await context.patch(fileId, false)).statusCode).toBe(200);
    }
    const items = await context.database
      .selectFrom("items")
      .selectAll()
      .orderBy("burst_index")
      .execute();
    expect(
      items.map((item) => {
        return item.id;
      }),
    ).toEqual(itemIds);
    expect(
      new Set(
        items.map((item) => {
          return item.burst_id;
        }),
      ).size,
    ).toBe(1);
    expect(items[0]?.burst_id).not.toBeNull();
    expect((await context.patch(context.fileIds[0]!, true)).statusCode).toBe(
      200,
    );
    await context.database
      .updateTable("items")
      .set({ captured_on: "2026-09-13" })
      .where("id", "=", itemIds[0]!)
      .execute();
    const moved = await context.read();
    expect(moved.json().files[0].burst).toMatchObject({
      isExcluded: true,
      canRestore: false,
      photoCount: 2,
    });
    expect((await context.patch(context.fileIds[0]!, false)).statusCode).toBe(
      409,
    );
  });

  it("allows admins and hides a session from another uploader", async () => {
    const context = await _makeContext();
    const admin = await insertSignedInMember({
      database: context.database,
      token: "admin",
      member: { role: "admin" },
    });
    const other = await insertSignedInMember({
      database: context.database,
      token: "other",
      member: { role: "uploader" },
    });
    expect(
      (await context.patch(context.fileIds[0]!, true, other.cookie)).statusCode,
    ).toBe(404);
    expect(
      (await context.patch(context.fileIds[0]!, true, admin.cookie)).statusCode,
    ).toBe(200);
  });

  it("preserves existing mixed photo/video detection while offering controls only on photos", async () => {
    const context = await _makeContext();
    await context.database
      .updateTable("upload_files")
      .set({ kind: "video", capture_source: "video_metadata" })
      .where("id", "=", context.fileIds[2]!)
      .execute();
    const response = await context.read();
    expect(response.json().files[0].burst).toMatchObject({
      photoCount: 3,
      isExcluded: false,
    });
    expect(response.json().files[2].burst).toBeNull();
    expect((await context.patch(context.fileIds[2]!, true)).statusCode).toBe(
      409,
    );
  });

  it.each(["refused", "cancelled", "duplicate", "filename"])(
    "excludes %s from candidate grouping",
    async (reason) => {
      const context = await _makeContext();
      await context.database
        .updateTable("upload_files")
        .set(
          reason === "filename"
            ? { capture_source: "filename" }
            : reason === "duplicate"
              ? { state: "refused", duplicate_reason: "batch" }
              : { state: reason },
        )
        .where("id", "=", context.fileIds[2]!)
        .execute();
      const response = await context.read();
      expect(
        response.json().files.every((file: { burst: unknown }) => {
          return file.burst === null;
        }),
      ).toBe(true);
    },
  );
});
