import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { createProcessingAcceptance } from "../support/createProcessingAcceptance.ts";
import { createMediaProcessingQueue } from "../../apps/server/src/mediaProcessing/queue/createMediaProcessingQueue.ts";
import { discoverMediaProcessingWork } from "../../apps/server/src/mediaProcessing/queue/discoverMediaProcessingWork.ts";

// Actual local bucket and codecs; this proves lifecycle, never OS isolation.
test("new upload and reopened repair publish without delaying original archival", async ({
  request,
}, testInfo) => {
  const directory = resolve(
    `tmp/media-loading/b5-${testInfo.project.name}-${Date.now()}`,
  );
  const context = await createProcessingAcceptance(directory);
  try {
    const upload = await context.upload();
    const response = await request.post(
      `${context.origin}/api/upload-sessions/${upload.sessionId}/files/${upload.fileId}/complete`,
      {
        headers: { cookie: context.member.cookie },
        data: {
          outcome: "done",
          contentHash: upload.contentHash,
          byteSize: upload.bytes.length,
          width: 1600,
          height: 2400,
          renditions: [],
        },
      },
    );
    expect(response.status(), await response.text()).toBe(200);
    const file = await context.database
      .selectFrom("upload_files")
      .select("item_id")
      .where("id", "=", upload.fileId)
      .executeTakeFirstOrThrow();
    expect(file.item_id).not.toBeNull();
    expect(
      await context.database
        .selectFrom("media_processing_jobs")
        .select(["state", "attempts"])
        .execute(),
    ).toEqual([{ state: "pending", attempts: 0 }]);
    expect((await request.get(`${context.origin}/api/health`)).status()).toBe(
      200,
    );
    const original = await request.get(
      `${context.origin}/api/items/${file.item_id}/original`,
      { headers: { cookie: context.member.cookie } },
    );
    expect(original.status()).toBe(200);
    expect(await original.body()).toEqual(upload.bytes);
    await context.app.jobRunner.runOnce("media-processing");
    expect(
      await context.database
        .selectFrom("media_processing_jobs")
        .select("attempts")
        .execute(),
    ).toEqual([{ attempts: 0 }]);
    await context.run();
    expect(
      await context.database
        .selectFrom("media_processing_jobs")
        .select("state")
        .execute(),
    ).toEqual([{ state: "complete" }]);
    const repair = await context.repair();
    await discoverMediaProcessingWork({
      database: context.database,
      now: new Date().toISOString(),
      limit: 100,
    });
    const claim = (await createMediaProcessingQueue({
      database: context.database,
      clock: () => {
        return new Date();
      },
    }).claim())!;
    await context.database
      .insertInto("media_processing_outputs")
      .values({
        id: "crash-before-upload",
        job_id: claim.jobId,
        item_id: repair.itemId,
        attempt_token: claim.attemptToken,
        storage_key: "derived/crashed",
        purpose: "thumb",
        state: "reserved",
        multipart_upload_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
    await context.database
      .updateTable("media_processing_jobs")
      .set({ lease_expires_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", claim.jobId)
      .execute();
    await context.reopen();
    await context.run();
    const jobs = await context.database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .execute();
    expect(
      jobs.every((job) => {
        return job.state === "complete";
      }),
    ).toBe(true);
    expect(
      await context.database
        .selectFrom("media_processing_outputs")
        .select("state")
        .where("id", "=", "crash-before-upload")
        .execute(),
    ).toEqual([{ state: "cleanup" }]);
    const originalBytes = await request.get(
      await context.b2.presignGet({ key: "existing/original.jpg" }),
    );
    expect(await originalBytes.body()).toEqual(repair.bytes);
    await mkdir(directory, { recursive: true });
    await writeFile(
      `${directory}/evidence.json`,
      JSON.stringify(
        {
          isolation: "unverified; verification-only direct codec adapter",
          jobs,
          requests: await context.requests(),
        },
        null,
        2,
      ),
    );
    await testInfo.attach("local-bucket-lifecycle", {
      path: `${directory}/evidence.json`,
      contentType: "application/json",
    });
  } finally {
    await context.close();
  }
});
