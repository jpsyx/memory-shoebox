import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../../src/db/client.ts";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  startMemberAuthorityWorker,
  stopMemberAuthorityWorkers,
} from "../../memberAuthorityWorkerHelpers/memberAuthorityWorkerHelpers.ts";

async function _expectSerializedAuthorityWorkers(
  workers: ReadonlyArray<ReturnType<typeof startMemberAuthorityWorker>>,
): Promise<void> {
  await Promise.all(
    workers.map((worker) => {
      return worker.ready;
    }),
  );
  workers.forEach((worker) => {
    return worker.child.stdin.end("go");
  });
  expect(
    (
      await Promise.all(
        workers.map((worker) => {
          return worker.result;
        }),
      )
    ).sort(),
  ).toEqual(["members_last_admin", "ok"]);
}

async function _prepareConcurrentAdmins(
  database: DatabaseExecutor,
): Promise<[SignedInMember, SignedInMember]> {
  const first = await insertSignedInMember({
    database,
    token: "first",
    member: { role: "admin" },
  });
  const second = await insertSignedInMember({
    database,
    token: "second",
    member: { role: "admin" },
  });
  return [first, second];
}

describe("member authority", () => {
  it.each(["changeMemberRole", "removeMember"])(
    "serializes concurrent %s attempts on separate process/file connections",
    async (action) => {
      const directory = await mkdtemp(join(tmpdir(), "shoebox-authority-"));
      let ownedDatabase: ReturnType<typeof createDatabase> | undefined;
      let context: Awaited<ReturnType<typeof createTestApp>> | undefined;
      const workers: Array<ReturnType<typeof startMemberAuthorityWorker>> = [];
      try {
        const databasePath = join(directory, "catalog.sqlite");
        ownedDatabase = createDatabase(databasePath);
        context = await createTestApp({ database: ownedDatabase });
        const database = ownedDatabase;
        const adminsToChange = await _prepareConcurrentAdmins(database);
        adminsToChange.forEach((member) => {
          workers.push(
            startMemberAuthorityWorker({
              databasePath,
              memberId: member.memberId,
              sessionId: member.sessionId,
              action,
            }),
          );
        });
        await _expectSerializedAuthorityWorkers(workers);
        const admins = await database
          .selectFrom("members")
          .select("id")
          .where("role", "=", "admin")
          .where("status", "=", "active")
          .execute();
        expect(admins.length).toBeGreaterThanOrEqual(1);
      } finally {
        try {
          await stopMemberAuthorityWorkers(workers);
        } finally {
          try {
            await context?.app.close();
          } finally {
            try {
              await ownedDatabase?.destroy();
            } finally {
              await rm(directory, { recursive: true, force: true });
            }
          }
        }
      }
    },
    15000,
  );
});
