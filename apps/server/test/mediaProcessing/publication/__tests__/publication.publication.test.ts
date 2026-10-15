import { expect, it } from "vitest";

import { publishMediaRenditions } from "../../../../src/mediaProcessing/output/publishMediaRenditions.ts";

import { createPublicationFixture } from "./publicationTestHelpers.ts";

it.each(["reclaim", "delete", "replace", "expire", "cleanup"] as const)(
  "old attempts and deleted items cannot publish: %s",
  async (change) => {
    const fixture = await createPublicationFixture();
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
  const fixture = await createPublicationFixture();
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
  const fixture = await createPublicationFixture();
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
  const fixture = await createPublicationFixture();
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
