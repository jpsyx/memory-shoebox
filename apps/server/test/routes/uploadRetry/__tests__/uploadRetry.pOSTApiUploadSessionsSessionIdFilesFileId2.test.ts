import {
  setUpUploadTestContext,
  settleWithOneDropped,
  recoverDroppedFile,
  captureAtSecond,
  readBurstState,
} from "./uploadRetryTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { insertPendingObjectDeletion } from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/retry", () => {
  it("leaves the deletion queue alone when it refuses the retry", async () => {
    const { database, seedFile, post, close } = await setUpUploadTestContext();
    const file = await seedFile({ position: 1, overrides: { state: "done" } });
    await insertPendingObjectDeletion(database, {
      storageKey: file.keyOf("original"),
    });

    const response = await post({ fileId: file.fileId, action: "retry" });

    expect(response.statusCode).toBe(409);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toHaveLength(1);
    await close();
  });

  it("does not stack a file recovered after settling into the burst it fell inside", async () => {
    const context = await setUpUploadTestContext();
    const { database, sessionId, seedFile, readFile, close } = context;
    // Three frames four seconds apart settle as one burst; the frame that
    // dropped was taken between the second and the third.
    const landed = [
      await seedFile({ position: 1, overrides: captureAtSecond(0) }),
      await seedFile({ position: 2, overrides: captureAtSecond(4) }),
      await seedFile({ position: 3, overrides: captureAtSecond(8) }),
    ];
    const dropped = await seedFile({
      position: 4,
      overrides: captureAtSecond(6),
    });
    await settleWithOneDropped({
      context: context,
      files: { landed, dropped },
    });
    const settled = await readBurstState({
      database: database,
      sessionId: sessionId,
    });
    expect(settled.bursts).toHaveLength(1);
    expect(
      settled.frames.map((frame) => {
        return frame.burst_index;
      }),
    ).toEqual([1, 2, 3]);

    const { recovered } = await recoverDroppedFile({
      context: context,
      dropped: dropped,
    });

    expect(recovered.statusCode).toBe(200);
    const recoveredItemId = (await readFile(dropped.fileId)).item_id;
    const after = await readBurstState({
      database: database,
      sessionId: sessionId,
    });
    expect(after.bursts).toEqual(settled.bursts);
    expect(
      after.frames.filter((frame) => {
        return frame.id !== recoveredItemId;
      }),
    ).toEqual(settled.frames);
    expect(
      after.frames.find((frame) => {
        return frame.id === recoveredItemId;
      }),
    ).toMatchObject({ burst_id: null, burst_index: null });
    await close();
  });
});
