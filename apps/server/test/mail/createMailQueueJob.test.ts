import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createMailQueueJob } from "../../src/mail/createMailQueueJob.ts";
import { createRecordingEmailService } from "../helpers/createRecordingEmailService.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

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
      emailService: createRecordingEmailService(),
    });

    // It runs, which is the point: `runOnce` throws on an unknown name.
    await context.app.jobRunner.runOnce("mail-queue");

    await context.close();
  });

  it("builds the fake from the environment, through the application", async () => {
    // The only check that `app.ts` reaches the factory at all. Everything else
    // calls `createEmailService` directly, so a boot wired to the wrong
    // builder, or to none, would pass every other test in the suite.
    //
    // Nothing is sent, and nothing is written: the fake creates its output
    // directory inside `send`, so constructing one touches no disk. That is
    // what makes it safe to build the real default here rather than thread a
    // temporary directory through `AppDeps` for the sake of one assertion.
    const context = await createTestApp({
      config: createTestConfig({ ENABLE_FAKE_EMAIL: "true" }),
    });

    expect(context.app.emailService).toBeDefined();

    await context.close();
  });

  it("has no sender when RESEND_API_KEY is unset, and still starts", async () => {
    const context = await createTestApp();

    expect(context.app.emailService).toBeUndefined();
    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(response.statusCode).toBe(200);

    await context.close();
  });
});
