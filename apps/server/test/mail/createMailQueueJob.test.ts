import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createMailQueueJob } from "../../src/mail/createMailQueueJob.ts";
import { createRecordingMailSender } from "../helpers/createRecordingMailSender.ts";
import { createTestApp } from "../helpers/createTestApp.ts";

describe("the mail queue on the runner", () => {
  it("is a job named mail-queue, running every ten seconds", async () => {
    const database = createDatabase(":memory:");

    const job = createMailQueueJob({ database, sender: undefined });

    expect(job.name).toBe("mail-queue");
    expect(job.intervalMs).toBe(10_000);
    await database.destroy();
  });

  it("is registered on the runner under that name", async () => {
    const context = await createTestApp({
      mailSender: createRecordingMailSender(),
    });

    // It runs, which is the point: `runOnce` throws on an unknown name.
    await context.app.jobRunner.runOnce("mail-queue");

    await context.close();
  });

  it("has no sender when RESEND_API_KEY is unset, and still starts", async () => {
    const context = await createTestApp();

    expect(context.app.mailSender).toBeUndefined();
    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(response.statusCode).toBe(200);

    await context.close();
  });
});
