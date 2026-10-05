import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startMemberAuthorityWorker,
  stopMemberAuthorityWorkers,
} from "./memberAuthorityWorkerHelpers.ts";

it("rejects readiness as well as completion when the child exits before ready", async () => {
  const directory = await mkdtemp(join(tmpdir(), "authority-early-exit-"));
  const databasePath = join(directory, "corrupt.db");
  await writeFile(databasePath, "not a SQLite catalog");
  const worker = startMemberAuthorityWorker({
    databasePath,
    memberId: "member",
    sessionId: "session",
    action: "removeMember",
  });
  let readiness = "pending";
  const ready = worker.ready.then(
    () => {
      readiness = "fulfilled";
    },
    () => {
      readiness = "rejected";
    },
  );
  try {
    await expect(worker.result).rejects.toThrow("file is not a database");
    expect(readiness).toBe("rejected");
    await ready;
  } finally {
    await stopMemberAuthorityWorkers([worker]);
    await rm(directory, { recursive: true, force: true });
  }
});
it("waits for owned child exit before permitting shared catalog teardown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "authority-shutdown-"));
  const worker = startMemberAuthorityWorker({
    databasePath: join(directory, "catalog.db"),
    memberId: "member",
    sessionId: "session",
    action: "removeMember",
  });
  const result = worker.result.catch(() => {
    return undefined;
  });
  try {
    await worker.ready;
    await stopMemberAuthorityWorkers([worker]);
    expect(
      worker.child.exitCode !== null || worker.child.signalCode !== null,
    ).toBe(true);
  } finally {
    await stopMemberAuthorityWorkers([worker]);
    await result;
    await rm(directory, { recursive: true, force: true });
  }
});
