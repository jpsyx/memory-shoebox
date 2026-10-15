import { expect, it, onTestFinished } from "vitest";

import { createDatabase } from "../../../src/db/client.ts";

import { discoverMediaProcessingWork } from "../../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";

import {
  insertItem,
  insertRendition,
} from "../../helpers/seedHelpers/seedHelpers.ts";

import { createLifecycleFixture } from "../lifecycleTestHelpers.ts";

import { appConfig } from "../../../../../app.config.ts";

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
