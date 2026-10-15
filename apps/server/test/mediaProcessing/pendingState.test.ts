import { expect, it } from "vitest";
import { createLifecycleFixture } from "./lifecycleTestHelpers.ts";
import { discoverMediaProcessingWork } from "../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";
import { readMediaSources } from "../../src/archive/readMediaSources.ts";
import { makeMediaRefFromSources } from "../../src/archive/makeMediaRefFromSources.ts";
import { insertRendition } from "../helpers/seedHelpers/seedHelpers.ts";

it("exposes pending only for current source and policy, retaining ready sources", async () => {
  const fixture = await createLifecycleFixture();
  const read = () => {
    return readMediaSources({
      ...fixture,
      purposesByItemId: new Map([[fixture.itemId, "thumbnail"]]),
      now: fixture.clock(),
      ttlSeconds: 3600,
    });
  };
  await discoverMediaProcessingWork({
    ...fixture,
    now: fixture.clock().toISOString(),
    limit: 100,
  });
  expect((await read()).previewStatesByItemId.get(fixture.itemId)).toBe(
    "pending",
  );
  await fixture.database
    .updateTable("media_processing_jobs")
    .set({ recipe: "old-policy" })
    .execute();
  expect(
    (await read()).previewStatesByItemId.get(fixture.itemId),
  ).toBeUndefined();
  await discoverMediaProcessingWork({
    ...fixture,
    now: fixture.clock().toISOString(),
    limit: 100,
  });
  await fixture.database
    .updateTable("item_renditions")
    .set({ id: "replaced-source" })
    .where("purpose", "=", "original")
    .execute();
  expect(
    (await read()).previewStatesByItemId.get(fixture.itemId),
  ).toBeUndefined();
  await discoverMediaProcessingWork({
    ...fixture,
    now: fixture.clock().toISOString(),
    limit: 100,
  });
  await insertRendition(fixture.database, {
    itemId: fixture.itemId,
    purpose: "thumb",
  });
  const result = await read();
  expect(
    makeMediaRefFromSources({
      sources: result.sourcesByItemId.get(fixture.itemId)!,
      previewState:
        result.previewStatesByItemId.get(fixture.itemId) ?? "unavailable",
      kind: "photo",
      width: 10,
      height: 10,
      durationMs: null,
      altText: "Photo",
    }).previewState,
  ).toBe("ready");
  await fixture.database
    .updateTable("media_processing_jobs")
    .set({ state: "unavailable" })
    .execute();
  expect(
    (await read()).previewStatesByItemId.get(fixture.itemId),
  ).toBeUndefined();
});
