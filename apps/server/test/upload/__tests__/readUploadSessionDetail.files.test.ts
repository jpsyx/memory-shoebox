import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/http/ApiError.ts";
import { makeUploadFileDtosFromRows } from "../../../src/upload/readUploadFilePage/makeUploadFileDtosFromRows.ts";
import {
  insertItem,
  insertItemPerson,
  insertPerson,
  insertRendition,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDetailContext,
  insertManifestFile,
  readDetail,
} from "./readUploadSessionDetailTestHelpers.ts";

describe("readUploadSessionDetail: the file page", () => {
  it("pages the manifest in position order and ends on a null cursor", async () => {
    const context = await createDetailContext();
    await Promise.all(
      [0, 1, 2, 3, 4].map((position) => {
        return insertManifestFile({ context: context, options: { position } });
      }),
    );
    const pageOf = async (cursor: string | undefined) => {
      const detail = await readDetail({
        context: context,
        page: {
          limit: 2,
          cursor,
          states: undefined,
        },
      });
      return {
        positions: detail.files.map((file) => {
          return file.position;
        }),
        nextCursor: detail.nextCursor,
      };
    };

    const first = await pageOf(undefined);
    const second = await pageOf(first.nextCursor ?? undefined);
    const third = await pageOf(second.nextCursor ?? undefined);

    expect(first.positions).toEqual([0, 1]);
    expect(second.positions).toEqual([2, 3]);
    expect(third).toEqual({ positions: [4], nextCursor: null });
    await context.database.destroy();
  });

  it("filters the page to the states asked for", async () => {
    const context = await createDetailContext({
      state: "settled",
      committed_at: NOW,
      settled_at: NOW,
    });
    await insertManifestFile({
      context: context,
      options: {
        position: 0,
        overrides: { state: "done" },
      },
    });
    const failed = await insertManifestFile({
      context: context,
      options: {
        position: 1,
        overrides: { state: "failed", problem_code: "connection_lost" },
      },
    });
    const refused = await insertManifestFile({
      context: context,
      options: {
        position: 2,
        overrides: { state: "refused", problem_code: "unsupported_type" },
      },
    });

    const detail = await readDetail({
      context: context,
      page: {
        limit: 100,
        cursor: undefined,
        states: ["failed", "refused"],
      },
    });

    expect(
      detail.files.map((file) => {
        return [file.fileId, file.problemCode];
      }),
    ).toEqual([
      [failed, "connection_lost"],
      [refused, "unsupported_type"],
    ]);
    await context.database.destroy();
  });

  it("refuses a cursor it did not issue with a 400 naming the cursor", async () => {
    const context = await createDetailContext();

    const refusal = await readDetail({
      context: context,
      page: {
        limit: 2,
        cursor: "not-a-cursor",
        states: undefined,
      },
    }).catch((error: unknown) => {
      return error as ApiError;
    });

    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).statusCode).toBe(400);
    expect((refusal as ApiError).details?.fieldErrors?.cursor).toBeDefined();
    await context.database.destroy();
  });

  it("draws a file's print once it is an item, and nothing before", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const itemId = await insertItem(context.database, {
      uploadedBy: context.memberId,
      upload_session_id: context.sessionId,
      captured_at: "2026-09-14T04:41:32.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(context.database, { itemId, purpose: "original" });
    await insertRendition(context.database, { itemId, purpose: "thumb" });
    const mateoId = await insertPerson(context.database, {
      displayName: "Mateo",
    });
    await insertItemPerson(context.database, { itemId, personId: mateoId });
    await insertManifestFile({ context: context, options: { position: 0 } });
    await insertManifestFile({
      context: context,
      options: {
        position: 1,
        overrides: { state: "done", item_id: itemId },
      },
    });

    const [waiting, landed] = (await readDetail({ context: context })).files;

    expect(waiting?.media).toBeNull();
    expect(landed?.itemId).toBe(itemId);
    expect(landed?.media?.thumb.url).toBe(
      `https://b2.test/get/${encodeURIComponent(`items/${itemId}/thumb.jpg`)}`,
    );
    // No display copy was stored, so the print falls back to the original.
    expect(landed?.media?.display.url).toContain("original.jpg");
    expect(landed?.media?.altText).toBe("Mateo, 14 September 2026");
    await context.database.destroy();
  });

  it("composes the rows it is given exactly as the page does, in their order", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    const itemId = await insertItem(context.database, {
      uploadedBy: context.memberId,
      upload_session_id: context.sessionId,
      captured_on: "2026-09-14",
    });
    await insertRendition(context.database, { itemId, purpose: "original" });
    await insertManifestFile({ context: context, options: { position: 0 } });
    await insertManifestFile({
      context: context,
      options: {
        position: 1,
        overrides: { state: "done", item_id: itemId },
      },
    });
    const newestFirst = await context.database
      .selectFrom("upload_files")
      .selectAll()
      .where("upload_session_id", "=", context.sessionId)
      .orderBy("position", "desc")
      .execute();

    const composed = await makeUploadFileDtosFromRows({
      database: context.database,
      b2: context.b2,
      fileRows: newestFirst,
      now: new Date(NOW),
    });

    expect(composed).toEqual(
      [...(await readDetail({ context: context })).files].reverse(),
    );
    expect(composed[0]?.media).not.toBeNull();
    await context.database.destroy();
  });
});

describe("readUploadSessionDetail: what is still to come", () => {
  it("lists the first hundred files still waiting or sending, in order", async () => {
    const context = await createDetailContext({
      state: "uploading",
      committed_at: NOW,
    });
    await insertManifestFile({
      context: context,
      options: {
        position: 0,
        overrides: { state: "done" },
      },
    });
    await Promise.all(
      Array.from({ length: 101 }, (_unused, index) => {
        return insertManifestFile({
          context: context,
          options: {
            position: index + 1,
            overrides: { state: index === 0 ? "sending" : "waiting" },
          },
        });
      }),
    );

    const { pendingFiles } = await readDetail({ context: context });

    expect(pendingFiles).toHaveLength(100);
    expect(pendingFiles[0]?.originalFilename).toBe("IMG_0001.jpg");
    expect(pendingFiles[99]?.originalFilename).toBe("IMG_0100.jpg");
    await context.database.destroy();
  });
});
