import { expect, it } from "vitest";
import { createVisualFingerprintBackfillJob } from "../../../src/maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";
import {
  createBackfillTestContext,
  FINGERPRINT,
} from "./backfillTestHelpers.ts";

it.each(["delete", "replace-rendition", "replace-original", "change-item"])(
  "does not attach stale evidence after %s during download",
  async (change) => {
    const context = await createBackfillTestContext();
    try {
      const itemId = await context.seed();
      await createVisualFingerprintBackfillJob({
        ...context.options,
        fetch: async (input, init) => {
          if (change === "delete") {
            await context.database
              .deleteFrom("items")
              .where("id", "=", itemId)
              .execute();
          } else if (change === "change-item") {
            await context.database
              .updateTable("items")
              .set({ checksum: "changed-original" })
              .where("id", "=", itemId)
              .execute();
          } else {
            await context.database
              .updateTable("item_renditions")
              .set({ storage_key: "replacement.jpg" })
              .where("item_id", "=", itemId)
              .where(
                "purpose",
                "=",
                change === "replace-original" ? "original" : "thumb",
              )
              .execute();
          }
          return context.options.fetch(input, init);
        },
      }).run();
      expect(
        (await context.readItem(itemId))?.visual_fingerprint ?? null,
      ).toBeNull();
      expect(await context.readQueue()).toHaveLength(
        change === "delete" ? 0 : 1,
      );
    } finally {
      await context.database.destroy();
    }
  },
);

it.each(["truncated", "oversized", "encoded"])(
  "rejects %s bodies and keeps durable retry state",
  async (problem) => {
    const context = await createBackfillTestContext();
    try {
      const itemId = await context.seed(["original"]);
      await createVisualFingerprintBackfillJob({
        ...context.options,
        fetch: async () => {
          return new Response(
            new Uint8Array(problem === "oversized" ? [1, 2, 3, 4] : [1]),
            {
              headers:
                problem === "encoded" ? { "content-encoding": "gzip" } : {},
            },
          );
        },
      }).run();
      expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
      expect(await context.readQueue()).toMatchObject([{ attempts: 1 }]);
    } finally {
      await context.database.destroy();
    }
  },
);

it("does not fetch sources over the memory cap", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed(["original"]);
    await context.database
      .updateTable("item_renditions")
      .set({ byte_size: 21 * 1024 * 1024 })
      .where("item_id", "=", itemId)
      .execute();
    await context.makeJob().run();
    expect(context.requestedKeys).toEqual([]);
    expect(await context.readQueue()).toMatchObject([
      { attempts: 1, last_error: "source_too_large" },
    ]);
  } finally {
    await context.database.destroy();
  }
});

it("aborts an interrupted download without consuming retry attempts and resumes later", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed(["original"]);
    const controller = new AbortController();
    await createVisualFingerprintBackfillJob({
      ...context.options,
      signal: controller.signal,
      fetch: async () => {
        controller.abort();
        throw new Error("https://signed.example/private?secret=credential");
      },
    }).run();
    expect(await context.readQueue()).toMatchObject([
      { attempts: 0, last_error: null },
    ]);
    await context.makeJob().run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBe(
      FINGERPRINT,
    );
  } finally {
    await context.database.destroy();
  }
});

it("keeps interrupted response streams eligible for a durable retry", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed(["original"]);
    await createVisualFingerprintBackfillJob({
      ...context.options,
      fetch: async () => {
        return new Response(
          new ReadableStream({
            start: (controller) => {
              controller.enqueue(new Uint8Array([1]));
              controller.error(new Error("connection lost"));
            },
          }),
        );
      },
    }).run();
    expect((await context.readItem(itemId))?.visual_fingerprint).toBeNull();
    expect(await context.readQueue()).toMatchObject([
      { attempts: 1, last_error: "download_failed" },
    ]);
  } finally {
    await context.database.destroy();
  }
});

it("records useful progress without exposing signed URLs in errors or logs", async () => {
  const context = await createBackfillTestContext();
  try {
    const itemId = await context.seed(["original"]);
    const logs: Array<{ details: Record<string, unknown>; message: string }> =
      [];
    await createVisualFingerprintBackfillJob({
      ...context.options,
      fetch: async () => {
        throw new Error("https://signed.example/private?secret=credential");
      },
      logger: {
        info: (details, message) => {
          logs.push({ details, message });
        },
      },
    }).run();
    expect(logs).toEqual([
      {
        details: { processed: 1, completed: 0, retries: 1, remaining: 1 },
        message: "photo fingerprint backfill progress",
      },
    ]);
    expect(await context.readQueue()).toMatchObject([
      { item_id: itemId, last_error: "download_failed" },
    ]);
  } finally {
    await context.database.destroy();
  }
});
