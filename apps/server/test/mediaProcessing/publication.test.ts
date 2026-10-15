import { expect, it, onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createMediaProcessingQueue } from "../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";
import { reserveMediaOutputs } from "../../src/mediaProcessing/output/reserveMediaOutputs.ts";
import { withUploadObjectCleanupLock } from "../../src/upload/withUploadObjectCleanupLock.ts";
import { runMediaProcessingQueueTransition } from "../../src/mediaProcessing/queue/runMediaProcessingQueueTransition.ts";
import { sql, type QueryId } from "kysely";
import { publishMediaRenditions } from "../../src/mediaProcessing/output/publishMediaRenditions.ts";
import type { ProcessingClaim } from "../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";
import type { ProcessedRendition } from "../../src/mediaProcessing/recipes/mediaRecipes.types.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

const NOW = "2026-10-14T12:00:00.000Z";
async function _fixture() {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await _seedRenditions(database, itemId);
  let now = NOW;
  const clock = () => {
    return new Date(now);
  };
  const shutdown = new AbortController();
  const queue = createMediaProcessingQueue({ database, clock });
  await queue.enqueue({
    itemId,
    sourceRenditionId,
    recipe: "photo-v1",
    priority: 100,
  });
  const claim = (await queue.claim())!;
  const outputs = await _seedOutputs(database, claim);
  return {
    database,
    queue,
    claim,
    outputs,
    itemId,
    sourceRenditionId,
    clock,
    shutdown,
    signal: shutdown.signal,
    advance: () => {
      now = "2026-10-14T12:02:00.000Z";
    },
    publish: () => {
      return publishMediaRenditions({
        database,
        claim,
        outputs,
        clock,
        signal: shutdown.signal,
      });
    },
  };
}

async function _seedRenditions(
  database: ReturnType<typeof createDatabase>,
  itemId: string,
) {
  const sourceRenditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
    storage_key: "original",
  });
  await insertRendition(database, {
    itemId,
    purpose: "display",
    storage_key: "old-display",
  });
  return sourceRenditionId;
}

async function _seedOutputs(
  database: ReturnType<typeof createDatabase>,
  claim: ProcessingClaim,
) {
  const outputs = ["thumb", "display_small", "display"].map((purpose) => {
    return {
      outputId: `new-${purpose}`,
      rendition: {
        purpose,
        path: `/owned/${purpose}`,
        contentType: "image/jpeg",
        byteSize: 10,
        width: 10,
        height: 10,
      } as ProcessedRendition,
    };
  });
  await database
    .insertInto("media_processing_outputs")
    .values(
      outputs.map(({ outputId, rendition }) => {
        return {
          id: outputId,
          job_id: claim.jobId,
          item_id: claim.itemId,
          attempt_token: claim.attemptToken,
          storage_key: `derived/${outputId}`,
          purpose: rendition.purpose as "display",
          state: "uploaded" as const,
          multipart_upload_id: null,
          created_at: NOW,
          updated_at: NOW,
        };
      }),
    )
    .execute();
  return outputs;
}

it.each(["reclaim", "delete", "replace", "expire", "cleanup"] as const)(
  "old attempts and deleted items cannot publish: %s",
  async (change) => {
    const fixture = await _fixture();
    const { database, claim } = fixture;
    if (change === "reclaim" || change === "expire") {
      fixture.advance();
    }
    if (change === "reclaim") {
      await fixture.queue.claim();
    }
    if (change === "delete") {
      await database
        .deleteFrom("items")
        .where("id", "=", claim.itemId)
        .execute();
    }
    if (change === "replace") {
      await database
        .updateTable("item_renditions")
        .set({ id: "replacement" })
        .where("id", "=", claim.sourceRenditionId)
        .execute();
    }
    if (change === "cleanup") {
      await database
        .updateTable("media_processing_outputs")
        .set({ state: "cleanup" })
        .where("id", "=", fixture.outputs[0]!.outputId)
        .execute();
    }
    const before = await database
      .selectFrom("item_renditions")
      .selectAll()
      .execute();
    expect(await fixture.publish()).toBe(false);
    expect(
      await database.selectFrom("item_renditions").selectAll().execute(),
    ).toEqual(before);
  },
);

it("publishes once and cleans only superseded derivatives", async () => {
  const fixture = await _fixture();
  expect(await fixture.publish()).toBe(true);
  expect(await fixture.publish()).toBe(false);
  const rows = await fixture.database
    .selectFrom("item_renditions")
    .selectAll()
    .execute();
  expect(
    rows
      .map((row) => {
        return row.storage_key;
      })
      .sort(),
  ).toEqual([
    "derived/new-display",
    "derived/new-display_small",
    "derived/new-thumb",
    "original",
  ]);
  expect(
    rows
      .filter((row) => {
        return row.purpose !== "original";
      })
      .map((row) => {
        return row.id;
      }),
  ).not.toContain(fixture.sourceRenditionId);
  expect(
    await fixture.database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .execute(),
  ).toEqual([{ storage_key: "old-display" }]);
  expect(
    await fixture.database
      .selectFrom("media_processing_jobs")
      .select(["state", "lease_token"])
      .execute(),
  ).toEqual([{ state: "complete", lease_token: null }]);
});

it("refuses incomplete and duplicate output sets atomically", async () => {
  const fixture = await _fixture();
  expect(
    await publishMediaRenditions({
      ...fixture,
      outputs: fixture.outputs.slice(1),
    }),
  ).toBe(false);
  expect(
    await publishMediaRenditions({
      ...fixture,
      outputs: [...fixture.outputs, fixture.outputs[0]!],
    }),
  ).toBe(false);
  expect(await fixture.publish()).toBe(true);
});

it("uses renewed database expiry and leaves durable publication after commit", async () => {
  const fixture = await _fixture();
  await fixture.database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: "2026-10-14T12:04:00.000Z" })
    .where("id", "=", fixture.claim.jobId)
    .execute();
  fixture.advance();
  expect(await fixture.publish()).toBe(true);
  expect(
    await fixture.database
      .selectFrom("media_processing_outputs")
      .select("state")
      .execute(),
  ).toEqual(
    Array.from({ length: 3 }, () => {
      return { state: "published" };
    }),
  );
});

type Fixture = Awaited<ReturnType<typeof _fixture>>;

async function _readPublicationState(database: Fixture["database"]) {
  return {
    renditions: await database
      .selectFrom("item_renditions")
      .selectAll()
      .orderBy("id")
      .execute(),
    outputs: await database
      .selectFrom("media_processing_outputs")
      .selectAll()
      .orderBy("id")
      .execute(),
    jobs: await database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .orderBy("id")
      .execute(),
    deletions: await database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .orderBy("id")
      .execute(),
  };
}

function _runOutputTransition(
  fixture: Fixture,
  operation: "publish" | "reserve",
  database = fixture.database,
) {
  const options = { ...fixture, database };
  return operation === "publish"
    ? publishMediaRenditions(options)
    : reserveMediaOutputs({
        ...options,
        renditions: fixture.outputs.map((output) => {
          return output.rendition;
        }),
      });
}

function _interruptAttempt(fixture: Fixture, interruption: "expire" | "abort") {
  if (interruption === "expire") {
    fixture.advance();
  } else {
    fixture.shutdown.abort(new Error("shutdown"));
  }
}

async function _expectRefused(
  work: ReturnType<typeof _runOutputTransition>,
  operation: "publish" | "reserve",
) {
  if (operation === "publish") {
    expect(await work).toBe(false);
  } else {
    await expect(work).rejects.toThrow("processing_output_ownership_lost");
  }
}

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
    const fixture = await _fixture();
    const before = await _readPublicationState(fixture.database);
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
    const work = _runOutputTransition(fixture, operation);
    _interruptAttempt(fixture, interruption);
    release.resolve();
    await held;
    await _expectRefused(work, operation);
    expect(await _readPublicationState(fixture.database)).toEqual(before);
  },
);

function _makeInterruptedDatabase(
  fixture: Fixture,
  target: string,
  interruption: "expire" | "abort",
) {
  const writes = new Set<QueryId>();
  let interrupted = false;
  const database = fixture.database.withPlugin({
    transformQuery: (args) => {
      const compiled = fixture.database
        .getExecutor()
        .compileQuery(args.node, args.queryId);
      if (compiled.sql.startsWith(target)) {
        writes.add(args.queryId);
      }
      return args.node;
    },
    transformResult: async (args) => {
      if (writes.delete(args.queryId)) {
        interrupted = true;
        _interruptAttempt(fixture, interruption);
      }
      return args.result;
    },
  });
  return {
    database,
    didInterrupt: () => {
      return interrupted;
    },
  };
}

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
    const fixture = await _fixture();
    const before = await _readPublicationState(fixture.database);
    const observed = _makeInterruptedDatabase(fixture, target, interruption);
    await _expectRefused(
      _runOutputTransition(fixture, operation, observed.database),
      operation,
    );
    expect(observed.didInterrupt()).toBe(true);
    expect(await _readPublicationState(fixture.database)).toEqual(before);
  },
);

it.each(["ignore", "abort"] as const)(
  "rolls back final CAS refusal and preserves SQL error identity: %s",
  async (refusal) => {
    const fixture = await _fixture();
    const action =
      refusal === "ignore"
        ? "raise(ignore)"
        : "raise(abort, 'processing_output_ownership_lost')";
    await sql
      .raw(
        `create trigger refuse_processing_completion before update on media_processing_jobs when new.state = 'complete' begin select ${action}; end`,
      )
      .execute(fixture.database);
    const before = await _readPublicationState(fixture.database);
    const work = fixture.publish();
    if (refusal === "ignore") {
      expect(await work).toBe(false);
    } else {
      await expect(work).rejects.toThrow("processing_output_ownership_lost");
    }
    expect(await _readPublicationState(fixture.database)).toEqual(before);
  },
);
