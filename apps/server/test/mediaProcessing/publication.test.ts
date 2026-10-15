import { expect, it, onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createMediaProcessingQueue } from "../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";
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
  const queue = createMediaProcessingQueue({
    database,
    clock: () => {
      return new Date(now);
    },
  });
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
    advance: () => {
      now = "2026-10-14T12:02:00.000Z";
    },
    publish: () => {
      return publishMediaRenditions({ database, claim, outputs, now });
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
      now: NOW,
    }),
  ).toBe(false);
  expect(
    await publishMediaRenditions({
      ...fixture,
      outputs: [...fixture.outputs, fixture.outputs[0]!],
      now: NOW,
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
