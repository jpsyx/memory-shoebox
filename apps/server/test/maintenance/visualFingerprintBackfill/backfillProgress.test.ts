import { expect, it } from "vitest";
import { createVisualFingerprintBackfillJob } from "../../../src/maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";
import {
  createBackfillTestContext,
  FINGERPRINT,
} from "./backfillTestHelpers.ts";

it("processes at most five photos per tick using thumbnails, without rewriting originals or holding the database lock", async () => {
  const context = await createBackfillTestContext();
  try {
    await Array.from({ length: 6 }).reduce(async (previous) => {
      await previous;
      await context.seed();
    }, Promise.resolve());
    const originalBodies = [...context.bodies.entries()].map(([key, bytes]) => {
      return [key, [...bytes]];
    });
    const renditions = await context.database
      .selectFrom("item_renditions")
      .selectAll()
      .execute();
    await context.makeJob().run();
    expect(
      await context.database
        .selectFrom("items")
        .select("id")
        .where("visual_fingerprint", "=", FINGERPRINT)
        .execute(),
    ).toHaveLength(5);
    expect(await context.readQueue()).toHaveLength(1);
    expect(context.requestedKeys).toHaveLength(5);
    expect(
      context.requestedKeys.every((key) => {
        return key.endsWith("/thumb.jpg");
      }),
    ).toBe(true);
    expect(
      await context.database
        .selectFrom("item_renditions")
        .selectAll()
        .execute(),
    ).toEqual(renditions);
    expect(
      [...context.bodies.entries()].map(([key, bytes]) => {
        return [key, [...bytes]];
      }),
    ).toEqual(originalBodies);
    expect(context.callsInsideTransactions).toEqual([]);
    await context.makeJob().run();
    expect(await context.readQueue()).toEqual([]);
  } finally {
    await context.database.destroy();
  }
});

it("falls back from a failed thumbnail to display and from corrupt display to the original", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed();
    context.bodies.delete(`items/${itemId}/thumb.jpg`);
    context.bodies.set(
      `items/${itemId}/display.jpg`,
      new Uint8Array([0, 0, 0]),
    );
    await createVisualFingerprintBackfillJob({
      ...context.options,
      makeFingerprint: async (bytes) => {
        if (bytes[0] === 0) {
          throw new Error("corrupt image");
        }
        return FINGERPRINT;
      },
    }).run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBe(
      FINGERPRINT,
    );
    expect(context.requestedKeys).toEqual([
      `items/${itemId}/thumb.jpg`,
      `items/${itemId}/display.jpg`,
      `items/${itemId}/original.jpg`,
    ]);
    expect(await context.readQueue()).toEqual([]);
  } finally {
    await context.database.destroy();
  }
});

it("persists safe backoff and resumes on a new worker only after the retry is due", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed(["original"]);
    const original = context.bodies.get(`items/${itemId}/original.jpg`)!;
    context.bodies.clear();
    await context.makeJob().run();
    expect(await context.readQueue()).toMatchObject([
      {
        item_id: itemId,
        attempts: 1,
        last_error: "download_failed",
        next_attempt_at: "2026-09-27T10:01:00.000Z",
      },
    ]);
    expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
    context.bodies.set(`items/${itemId}/original.jpg`, original);
    await context.makeJob().run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
    context.setTime("2026-09-27T10:01:00.000Z");
    await context.makeJob().run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBe(
      FINGERPRINT,
    );
    expect(await context.readQueue()).toEqual([]);
  } finally {
    await context.database.destroy();
  }
});

it("removes featureless photos from the queue without inventing evidence or retrying forever", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed();
    await createVisualFingerprintBackfillJob({
      ...context.options,
      makeFingerprint: async () => {
        return undefined;
      },
    }).run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
    expect(await context.readQueue()).toEqual([]);
  } finally {
    await context.database.destroy();
  }
});
