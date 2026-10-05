import { describe, expect, it } from "vitest";
import { createConfiguredMailHealthApp } from "../../../helpers/createConfiguredMailHealthApp.ts";
import {
  NOW,
  insertOutboundEmail,
  shiftDays,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/mail/health", () => {
  it("keeps old terminal failures as history after recent mail succeeds", async () => {
    const { app, database, close } = await createConfiguredMailHealthApp();
    const oldInstant = shiftDays({ instant: NOW, days: -2 });
    await insertOutboundEmail(database, {
      state: "failed",
      created_at: oldInstant,
      last_error_code: "403",
      last_error_message: "Provider refused sender",
    });
    await insertOutboundEmail(database, { state: "sent", sent_at: NOW });
    const health = (await app.inject("/api/mail/health")).json();
    expect(health.diagnosis).toBeNull();
    expect(health.status).toBe("ok");
    expect(health.lastError.occurredAt).toBe(oldInstant);
    expect(health.queue.failedCount).toBe(1);
    await close();
  });
});
