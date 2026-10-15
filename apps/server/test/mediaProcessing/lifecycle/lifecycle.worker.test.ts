import { expect, it } from "vitest";

import { createLifecycleFixture } from "../lifecycleTestHelpers.ts";

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
