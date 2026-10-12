import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { createBackfillTestContext } from "./backfillTestHelpers.ts";

async function _makeImage(): Promise<Buffer> {
  const pixels = Buffer.from(
    Array.from({ length: 32 * 32 * 3 }, (_, index) => {
      return (index * 43 + Math.floor(index / 19) * 17) % 256;
    }),
  );
  return sharp(pixels, { raw: { width: 32, height: 32, channels: 3 } })
    .png()
    .toBuffer();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("starts automatically without waiting for media and fingerprints with the real decoder", async () => {
  const context = await createBackfillTestContext();
  const itemId = await context.seed(["original"]);
  const bytes = await _makeImage();
  await context.database
    .updateTable("item_renditions")
    .set({ byte_size: bytes.length })
    .where("item_id", "=", itemId)
    .execute();
  let hasStartedDownload = false;
  vi.stubGlobal("fetch", async () => {
    hasStartedDownload = true;
    return new Response(bytes);
  });
  vi.useFakeTimers();
  const appContext = await createTestApp({
    database: context.database,
    startBackgroundWork: true,
    emailService: "none",
  });
  try {
    expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hasStartedDownload).toBe(true);
    await appContext.app.jobRunner.runOnce("photo-fingerprint-backfill");
    expect((await context.readItem(itemId))?.visual_fingerprint).toMatch(
      /^v1:/,
    );
    expect(await context.readQueue()).toEqual([]);
  } finally {
    await appContext.close();
  }
});

it("cancels downloads before shutdown drains jobs and leaves interrupted work queued", async () => {
  const context = await createBackfillTestContext();
  await context.seed(["original"]);
  const started = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", (_input: unknown, init: RequestInit) => {
    started.resolve();
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => {
          reject(new Error("interrupted"));
        },
        { once: true },
      );
    });
  });
  const appContext = await createTestApp({
    database: context.database,
    emailService: "none",
  });
  try {
    const running = appContext.app.jobRunner.runOnce(
      "photo-fingerprint-backfill",
    );
    await Promise.race([started.promise, running]);
    await appContext.app.close();
    await running;
    expect(await context.readQueue()).toMatchObject([
      { attempts: 0, last_error: null },
    ]);
  } finally {
    await context.database.destroy();
  }
});
