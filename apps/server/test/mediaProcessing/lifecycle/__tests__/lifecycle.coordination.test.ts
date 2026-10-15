import { expect, it, onTestFinished } from "vitest";

import { createDatabase } from "../../../../src/db/client.ts";

import { migrateToLatest } from "../../../../src/db/migrate.ts";

import { createMediaDecodeCoordinator } from "../../../../src/mediaProcessing/createMediaDecodeCoordinator.ts";

import { discoverMediaProcessingWork } from "../../../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

import { createLifecycleFixture } from "../../lifecycleTestHelpers.ts";

import { createVisualFingerprintBackfillJob } from "../../../../src/maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";

import { createBackfillTestContext } from "../../../maintenance/visualFingerprintBackfill/backfillTestHelpers.ts";

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
