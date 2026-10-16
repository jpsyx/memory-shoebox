import { expect, it } from "vitest";

import { withUploadObjectCleanupLock } from "../../../../src/upload/withUploadObjectCleanupLock.ts";

import { runMediaProcessingQueueTransition } from "../../../../src/mediaProcessing/queue/runMediaProcessingQueueTransition.ts";

import { sql } from "kysely";

import {
  createPublicationFixture,
  expectRefused,
  interruptAttempt,
  makeInterruptedDatabaseFromFixture,
  readPublicationState,
  runOutputTransition,
} from "./publicationTestHelpers.ts";

it.each([
  ["publish", "cleanup", "expire"],
  ["publish", "cleanup", "abort"],
  ["publish", "processing", "expire"],
  ["publish", "processing", "abort"],
  ["reserve", "cleanup", "expire"],
  ["reserve", "cleanup", "abort"],
  ["reserve", "processing", "expire"],
  ["reserve", "processing", "abort"],
] as const)(
  "refuses queued %s after the %s gate outlives %s",
  async (operation, gate, interruption) => {
    const fixture = await createPublicationFixture();
    const before = await readPublicationState(fixture.database);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const callback = async () => {
      entered.resolve();
      await release.promise;
    };
    const held =
      gate === "cleanup"
        ? withUploadObjectCleanupLock({ database: fixture.database, callback })
        : runMediaProcessingQueueTransition({
            database: fixture.database,
            callback,
          });
    await entered.promise;
    const work = runOutputTransition({
      fixture: fixture,
      operation: operation,
    });
    interruptAttempt({ fixture, interruption });
    release.resolve();
    await held;
    await expectRefused({ work, operation });
    expect(await readPublicationState(fixture.database)).toEqual(before);
  },
);

it.each([
  ["publish", 'insert into "item_renditions"', "expire"],
  ["publish", 'insert into "item_renditions"', "abort"],
  ["publish", 'update "media_processing_jobs"', "expire"],
  ["publish", 'update "media_processing_jobs"', "abort"],
  ["reserve", 'insert into "media_processing_outputs"', "expire"],
  ["reserve", 'insert into "media_processing_outputs"', "abort"],
] as const)(
  "rolls back %s on %s when %s occurs after the SQL write",
  async (operation, target, interruption) => {
    const fixture = await createPublicationFixture();
    const before = await readPublicationState(fixture.database);
    const observed = makeInterruptedDatabaseFromFixture({
      fixture,
      target,
      interruption,
    });
    await expectRefused({
      work: runOutputTransition({
        fixture: fixture,
        operation: operation,
        database: observed.database,
      }),
      operation,
    });
    expect(observed.didInterrupt()).toBe(true);
    expect(await readPublicationState(fixture.database)).toEqual(before);
  },
);

it.each(["ignore", "abort"] as const)(
  "rolls back final CAS refusal and preserves SQL error identity: %s",
  async (refusal) => {
    const fixture = await createPublicationFixture();
    const action =
      refusal === "ignore"
        ? "raise(ignore)"
        : "raise(abort, 'processing_output_ownership_lost')";
    await sql
      .raw(
        `create trigger refuse_processing_completion before update on media_processing_jobs when new.state = 'complete' begin select ${action}; end`,
      )
      .execute(fixture.database);
    const before = await readPublicationState(fixture.database);
    const work = fixture.publish();
    if (refusal === "ignore") {
      expect(await work).toBe(false);
    } else {
      await expect(work).rejects.toThrow("processing_output_ownership_lost");
    }
    expect(await readPublicationState(fixture.database)).toEqual(before);
  },
);
