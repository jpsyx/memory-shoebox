import { expect, it, onTestFinished, vi } from "vitest";

import { discoverMediaProcessingWork } from "../../../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";

import { createLifecycleFixture } from "../../lifecycleTestHelpers.ts";

import { createMediaProcessingQueue } from "../../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

it("heartbeats at 30 seconds and aborts a decoder immediately after ownership is lost", async () => {
  const fixture = await createLifecycleFixture();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const started = Promise.withResolvers<void>();
  let aborted = false;
  fixture.runtime.processSource = async ({ signal }) => {
    started.resolve();
    await new Promise<void>((done) => {
      return signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          done();
        },
        { once: true },
      );
    });
    signal.throwIfAborted();
  };
  const running = fixture.makeJob().run();
  await started.promise;
  fixture.advance(30_000);
  await vi.advanceTimersByTimeAsync(30_000);
  const current = await fixture.database
    .selectFrom("media_processing_jobs")
    .selectAll()
    .executeTakeFirstOrThrow();
  expect(current.lease_expires_at).toBe(
    new Date(fixture.clock().getTime() + 120_000).toISOString(),
  );
  await fixture.database
    .updateTable("media_processing_jobs")
    .set({ lease_token: "replacement-token" })
    .execute();
  await vi.advanceTimersByTimeAsync(30_000);
  await running;
  expect(aborted).toBe(true);
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select("lease_token")
      .execute(),
  ).toEqual([{ lease_token: "replacement-token" }]);
});

it("handles stale source work explicitly and lets discovery enqueue its replacement", async () => {
  const fixture = await createLifecycleFixture();
  await discoverMediaProcessingWork({
    ...fixture,
    now: fixture.clock().toISOString(),
    limit: 100,
  });
  await fixture.database
    .updateTable("item_renditions")
    .set({ id: "replacement" })
    .where("id", "=", fixture.sourceId)
    .execute();
  await fixture.makeJob().run();
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select("error_code")
      .where("source_rendition_id", "=", fixture.sourceId)
      .execute(),
  ).toEqual([{ error_code: "processing_source_changed" }]);
  await fixture.makeJob().run();
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select("state")
      .where("source_rendition_id", "=", "replacement")
      .execute(),
  ).toEqual([{ state: "complete" }]);
});

it.each(["source", "delete", "reclaim"] as const)(
  "fences publication when %s changes during upload",
  async (change) => {
    const fixture = await createLifecycleFixture();
    const upload = fixture.b2.putObjectStream;
    let changed = false;
    fixture.b2.putObjectStream = async (options) => {
      await upload(options);
      if (changed) {
        return;
      }
      changed = true;
      if (change === "source") {
        await fixture.database
          .updateTable("item_renditions")
          .set({ id: "replacement" })
          .where("id", "=", fixture.sourceId)
          .execute();
      }
      if (change === "delete") {
        await fixture.database
          .deleteFrom("items")
          .where("id", "=", fixture.itemId)
          .execute();
      }
      if (change === "reclaim") {
        fixture.advance(120_000);
        await createMediaProcessingQueue(fixture).claim();
      }
    };
    await fixture.makeJob().run();
    expect(
      await fixture.database
        .selectFrom("item_renditions")
        .select("id")
        .where("purpose", "!=", "original")
        .execute(),
    ).toEqual([]);
    expect(
      await fixture.database
        .selectFrom("media_processing_outputs")
        .select("state")
        .where("state", "=", "published")
        .execute(),
    ).toEqual([]);
  },
);
