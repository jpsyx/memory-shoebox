import { expect, it, onTestFinished, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createMediaDecodeCoordinator } from "../../src/mediaProcessing/createMediaDecodeCoordinator.ts";
import { discoverMediaProcessingWork } from "../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("serializes fingerprint and video work and releases failed or aborted waiters", async () => {
  const coordinator = createMediaDecodeCoordinator();
  const shutdown = new AbortController();
  let active = 0;
  let maxActiveDecodes = 0;
  const work = async () => {
    active += 1;
    maxActiveDecodes = Math.max(maxActiveDecodes, active);
    await new Promise((done) => {
      return setTimeout(done, 5);
    });
    active -= 1;
  };
  const first = coordinator.run(work, shutdown.signal);
  const cancelled = new AbortController();
  const waiting = coordinator.run(work, cancelled.signal);
  cancelled.abort();
  await expect(waiting).rejects.toThrow();
  await Promise.all([first, coordinator.run(work, shutdown.signal)]);
  expect(maxActiveDecodes).toBe(1);
  await expect(
    coordinator.run(async () => {
      throw new Error("codec");
    }, shutdown.signal),
  ).rejects.toThrow("codec");
  await coordinator.run(work, shutdown.signal);
  expect(active).toBe(0);
});

it("discovers bounded metadata pages, prioritizes missing previews and resumes its durable cursor", async () => {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemIds = await Promise.all(
    [0, 1, 2].map(async (index) => {
      const itemId = await insertItem(database, {
        uploadedBy: memberId,
        seq: index + 1,
      });
      await insertRendition(database, { itemId, purpose: "original" });
      return itemId;
    }),
  );
  await insertRendition(database, { itemId: itemIds[0]!, purpose: "thumb" });
  await insertRendition(database, { itemId: itemIds[0]!, purpose: "display" });
  const options = { database, now: "2026-10-14T12:00:00.000Z", limit: 2 };
  expect(await discoverMediaProcessingWork(options)).toEqual({
    scanned: 2,
    hasMore: true,
  });
  expect(await discoverMediaProcessingWork(options)).toEqual({
    scanned: 1,
    hasMore: false,
  });
  const jobs = await database
    .selectFrom("media_processing_jobs")
    .selectAll()
    .execute();
  expect(jobs).toHaveLength(3);
  const upgrade = jobs.find((job) => {
    return job.item_id === itemIds[0];
  })!;
  expect(
    jobs
      .filter((job) => {
        return job.item_id !== itemIds[0];
      })
      .every((job) => {
        return job.priority > upgrade.priority;
      }),
  ).toBe(true);
  await discoverMediaProcessingWork(options);
  expect(
    await database.selectFrom("media_processing_jobs").selectAll().execute(),
  ).toHaveLength(3);
});

import { createLifecycleFixture } from "./lifecycleTestHelpers.ts";

it("archives independently, discovers later and publishes every required output", async () => {
  const fixture = await createLifecycleFixture();
  const job = fixture.makeJob();
  expect(fixture.b2.calls).toEqual([]);
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .execute(),
  ).toEqual([]);
  await job.run();
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select("state")
      .execute(),
  ).toEqual([{ state: "complete" }]);
  const rows = await fixture.database
    .selectFrom("item_renditions")
    .selectAll()
    .execute();
  expect(rows).toHaveLength(4);
  expect(
    rows.find((row) => {
      return row.purpose === "original";
    })!.id,
  ).toBe(fixture.sourceId);
});

it.each([
  "processing_upstream_timeout",
  "processing_upstream_unavailable",
  "processing_source_truncated",
])(
  "backs off transient source failure %s from one minute to one hour",
  async (code) => {
    const fixture = await createLifecycleFixture();
    fixture.runtime.processSource = async () => {
      throw new Error(code);
    };
    const job = fixture.makeJob();
    await job.run();
    let row = await fixture.database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      state: "pending",
      attempts: 1,
      error_code: code,
    });
    expect(Date.parse(row.next_attempt_at) - fixture.clock().getTime()).toBe(
      60_000,
    );
    fixture.advance(60_000);
    await fixture.database
      .updateTable("media_processing_jobs")
      .set({ attempts: 20 })
      .execute();
    await job.run();
    row = await fixture.database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(Date.parse(row.next_attempt_at) - fixture.clock().getTime()).toBe(
      3_600_000,
    );
  },
);

it.each([
  "processing_photo_limit",
  "processing_input_byte_limit",
  "processing_source_changed",
])("leaves %s unavailable without repeated attempts", async (code) => {
  const fixture = await createLifecycleFixture();
  fixture.runtime.processSource = async () => {
    throw new Error(code);
  };
  await fixture.makeJob().run();
  fixture.advance(4_000_000);
  await fixture.makeJob().run();
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select(["state", "attempts", "error_code"])
      .execute(),
  ).toEqual([{ state: "unavailable", attempts: 1, error_code: code }]);
});

it("keeps cleanup reachable while runtime is disabled and never decodes", async () => {
  const fixture = await createLifecycleFixture();
  await fixture.database
    .insertInto("media_processing_outputs")
    .values({
      id: "crashed",
      job_id: null,
      item_id: null,
      attempt_token: "old",
      storage_key: "derived/crashed",
      purpose: "thumb",
      state: "uploading",
      multipart_upload_id: "multipart",
      created_at: fixture.clock().toISOString(),
      updated_at: fixture.clock().toISOString(),
    })
    .execute();
  fixture.b2.multipartUploads.set("multipart", { key: "derived/crashed" });
  fixture.runtime.getCapabilities = async () => {
    return {
      available: false,
      reason: "processing_disabled",
    };
  };
  fixture.runtime.processSource = async () => {
    throw new Error("must not decode");
  };
  await fixture.makeJob().run();
  expect(fixture.b2.multipartUploads.size).toBe(0);
  expect(
    await fixture.database
      .selectFrom("media_processing_outputs")
      .select("state")
      .execute(),
  ).toEqual([{ state: "cleanup" }]);
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select(["state", "attempts"])
      .execute(),
  ).toEqual([{ state: "pending", attempts: 0 }]);
});

it("aborts and drains active processing on shutdown, retaining a resumable attempt", async () => {
  const fixture = await createLifecycleFixture();
  const started = Promise.withResolvers<void>();
  let drained = false;
  fixture.runtime.processSource = async ({ signal }) => {
    started.resolve();
    await new Promise<void>((done) => {
      return signal.addEventListener(
        "abort",
        () => {
          return done();
        },
        { once: true },
      );
    });
    await new Promise((done) => {
      return setTimeout(done, 5);
    });
    drained = true;
    signal.throwIfAborted();
  };
  const running = fixture.makeJob().run();
  await started.promise;
  fixture.shutdown.abort();
  await running;
  expect(drained).toBe(true);
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select(["state", "error_code"])
      .execute(),
  ).toEqual([{ state: "pending", error_code: "processing_cancelled" }]);
});

import { createMediaProcessingQueue } from "../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";
import { createVisualFingerprintBackfillJob } from "../../src/maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";
import { createBackfillTestContext } from "../maintenance/visualFingerprintBackfill/backfillTestHelpers.ts";

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

it("shares the real fingerprint job's lane with video and capability work", async () => {
  const fixture = await createLifecycleFixture();
  await fixture.database.updateTable("items").set({ kind: "video" }).execute();
  const backfill = await createBackfillTestContext();
  onTestFinished(() => {
    return backfill.database.destroy();
  });
  await backfill.seed();
  let active = 0;
  let maxActiveDecodes = 0;
  const enter = async () => {
    active += 1;
    maxActiveDecodes = Math.max(maxActiveDecodes, active);
    await new Promise((done) => {
      return setTimeout(done, 5);
    });
    active -= 1;
  };
  const process = fixture.runtime.processSource;
  fixture.runtime.getCapabilities = async () => {
    await enter();
    return { available: true, reason: null };
  };
  fixture.runtime.processSource = async (options) => {
    await enter();
    await process(options);
  };
  fixture.runtime.makeFingerprint = async () => {
    await enter();
    return undefined;
  };
  const fingerprint = createVisualFingerprintBackfillJob({
    ...backfill.options,
    coordinator: fixture.coordinator,
    runtime: fixture.runtime,
  });
  await Promise.all([fixture.makeJob().run(), fingerprint.run()]);
  expect(maxActiveDecodes).toBe(1);
  expect(await backfill.readQueue()).toEqual([]);
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

import { appConfig } from "../../../../app.config.ts";
import { join } from "node:path";

it("requalifies unavailable work only after configured recipe policy changes", async () => {
  const fixture = await createLifecycleFixture();
  const process = fixture.runtime.processSource;
  fixture.runtime.processSource = async () => {
    throw new Error("processing_photo_limit");
  };
  await fixture.makeJob().run();
  fixture.runtime.processSource = process;
  const previousLimit = appConfig.mediaProcessing.photoPixels;
  onTestFinished(() => {
    Object.assign(appConfig.mediaProcessing, { photoPixels: previousLimit });
  });
  Object.assign(appConfig.mediaProcessing, { photoPixels: previousLimit - 1 });
  await fixture.makeJob().run();
  const jobs = await fixture.database
    .selectFrom("media_processing_jobs")
    .select(["state", "recipe"])
    .execute();
  expect(
    jobs
      .map((job) => {
        return job.state;
      })
      .sort(),
  ).toEqual(["complete", "unavailable"]);
  expect(
    new Set(
      jobs.map((job) => {
        return job.recipe;
      }),
    ).size,
  ).toBe(2);
});

it("reopens discovery at its persisted page and caps a requested scan at 100", async () => {
  const fixture = await createLifecycleFixture();
  const original = await fixture.database
    .selectFrom("items")
    .selectAll()
    .executeTakeFirstOrThrow();
  for (let index = 0; index < 101; index += 1) {
    const itemId = await insertItem(fixture.database, {
      uploadedBy: original.uploaded_by,
      seq: index + 2,
    });
    await insertRendition(fixture.database, { itemId, purpose: "original" });
  }
  const first = await discoverMediaProcessingWork({
    ...fixture,
    now: fixture.clock().toISOString(),
    limit: 1000,
  });
  expect(first).toEqual({ scanned: 100, hasMore: true });
  await fixture.database.destroy();
  const reopened = createDatabase(join(fixture.directory, "catalog.db"));
  onTestFinished(() => {
    return reopened.destroy();
  });
  const second = await discoverMediaProcessingWork({
    database: reopened,
    now: fixture.clock().toISOString(),
    limit: 1000,
  });
  expect(second).toEqual({ scanned: 2, hasMore: false });
  expect(
    await reopened.selectFrom("media_processing_jobs").select("id").execute(),
  ).toHaveLength(102);
});
