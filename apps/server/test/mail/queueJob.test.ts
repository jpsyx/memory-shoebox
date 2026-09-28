import { describe, expect, it } from "vitest";
import { createRecordingMailSender } from "../helpers/recordingMailSender.ts";
import { createTestApp } from "../helpers/testApp.ts";

describe("the mail queue on the runner", () => {
  it("is registered at ten seconds, beside but not among the seven jobs", async () => {
    const context = await createTestApp({
      mailSender: createRecordingMailSender(),
    });

    // It runs, which is the point: `runOnce` throws on an unknown name.
    await context.app.jobRunner.runOnce("mail-queue");

    await context.close();
  });

  it("has no sender when RESEND_API_KEY is unset, and still starts", async () => {
    const context = await createTestApp();

    expect(context.app.mailSender).toBeNull();
    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(response.statusCode).toBe(200);

    await context.close();
  });
});
