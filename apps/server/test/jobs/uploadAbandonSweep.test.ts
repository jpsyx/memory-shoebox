import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runUploadAbandonSweep } from "../../src/jobs/uploadAbandonSweep.ts";
import {
  NOW,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../helpers/seed.ts";

async function createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  return { database, memberId };
}

describe("upload-abandon-sweep", () => {
  it("does nothing against empty tables", async () => {
    const { database } = await createContext();

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary).toEqual({ abandonedFileCount: 0, cancelledDraftCount: 0 });
    await database.destroy();
  });

  it("marks a stalled file abandoned, and is idempotent", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const stalledId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      updated_at: shiftMinutes(NOW, -90),
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      updated_at: shiftMinutes(NOW, -5),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.abandonedFileCount).toBe(1);
    expect(second.abandonedFileCount).toBe(0);
    const stalled = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", stalledId)
      .executeTakeFirstOrThrow();
    expect(stalled.state).toBe("failed");
    expect(stalled.problem_code).toBe("abandoned");
    await database.destroy();
  });

  it("leaves a file whose batch was never committed to the draft half", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -90),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      updated_at: shiftMinutes(NOW, -90),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("cancels a draft idle past appConfig.upload.draftExpiryHours, and is idempotent", async () => {
    const { database, memberId } = await createContext();
    const staleId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -8 * 24 * 60),
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -60),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.cancelledDraftCount).toBe(1);
    expect(second.cancelledDraftCount).toBe(0);
    const stale = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", staleId)
      .executeTakeFirstOrThrow();
    expect(stale.state).toBe("cancelled");
    await database.destroy();
  });

  it("never touches a settled batch", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: shiftMinutes(NOW, -120),
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
      updated_at: shiftMinutes(NOW, -120),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    await database.destroy();
  });

  it("leaves an in-flight file on a cancelled batch alone", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes(NOW, -120),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("leaves a file that already reached a terminal state", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const refusedId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "refused",
      problem_code: "unsupported_type",
      updated_at: shiftMinutes(NOW, -120),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const refused = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", refusedId)
      .executeTakeFirstOrThrow();
    expect(refused.state).toBe("refused");
    expect(refused.problem_code).toBe("unsupported_type");
    await database.destroy();
  });
});
