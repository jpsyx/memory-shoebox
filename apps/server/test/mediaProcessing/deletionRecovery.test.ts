import { expect, it } from "vitest";
import { createLifecycleFixture } from "./createLifecycleFixture.ts";
import { runDelete } from "../helpers/runDelete.ts";

it("queues unpublished attempts and preserves published tombstones when an item is deleted", async () => {
  const fixture = await createLifecycleFixture();
  await fixture.makeJob().run();
  await fixture.database
    .insertInto("media_processing_outputs")
    .values({
      id: "partial",
      job_id: null,
      item_id: fixture.itemId,
      attempt_token: "old",
      storage_key: "derived/partial",
      purpose: "thumb",
      state: "uploading",
      multipart_upload_id: "multipart",
      created_at: fixture.clock().toISOString(),
      updated_at: fixture.clock().toISOString(),
    })
    .execute();
  const member = await fixture.database
    .selectFrom("items")
    .select("uploaded_by")
    .where("id", "=", fixture.itemId)
    .executeTakeFirstOrThrow();
  await runDelete({ ...fixture, memberId: member.uploaded_by });
  const pending = await fixture.database
    .selectFrom("pending_object_deletions")
    .select("storage_key")
    .execute();
  expect(
    pending.map((row) => {
      return row.storage_key;
    }),
  ).toContain("derived/partial");
  expect(
    await fixture.database
      .selectFrom("media_processing_outputs")
      .select("state")
      .where("state", "=", "published")
      .execute(),
  ).toEqual([]);
  fixture.runtime.getCapabilities = async () => {
    return {
      available: false,
      reason: "processing_disabled",
    };
  };
  await fixture.makeJob().run();
  expect(
    await fixture.database
      .selectFrom("media_processing_outputs")
      .select("state")
      .execute(),
  ).toEqual(
    Array.from({ length: 4 }, () => {
      return { state: "cleanup" };
    }),
  );
});
