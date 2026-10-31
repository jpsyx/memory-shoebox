import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";
import { claimMemberName } from "../../src/members/claimMemberName.ts";

const directory = mkdtempSync(join(tmpdir(), "name-claims-"));
afterAll(() => {
  return rmSync(directory, { recursive: true, force: true });
});

it("retains prior names for their owner and never reveals the other owner", async () => {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const original = await insertMember(database);
    const other = await insertMember(database);
    const claim = (memberId: string, displayName: string) => {
      return runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return claimMemberName({
            transaction,
            memberId,
            displayName,
            now: "2026-10-31T00:00:00Z",
          });
        },
      });
    };
    await claim(original, " Sofía ");
    await claim(original, "Rosa");
    expect(await claim(original, "SOFÍA")).toBeUndefined();
    await expect(claim(other, "sofía")).rejects.toMatchObject({
      code: "name_taken",
      statusCode: 409,
      details: { fieldErrors: { displayName: expect.any(Array) } },
    });
    expect(
      await database.selectFrom("member_name_claims").selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database
        .selectFrom("people")
        .select("display_name")
        .where("member_id", "=", original)
        .executeTakeFirst(),
    ).toEqual({ display_name: "SOFÍA" });
  } finally {
    await database.destroy();
  }
});

it("rolls back the member, claim and linked person after a late person-write failure", async () => {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const memberId = await insertMember(database);
    await sql`create trigger fail_person before insert on people begin select raise(abort, 'late failure'); end`.execute(
      database,
    );
    await expect(
      runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return claimMemberName({
            transaction,
            memberId,
            displayName: "New name",
            now: "2026-10-31",
          });
        },
      }),
    ).rejects.toThrow("late failure");
    expect(
      (
        await database
          .selectFrom("members")
          .selectAll()
          .where("id", "=", memberId)
          .executeTakeFirst()
      )?.display_name,
    ).toBe("Abuela Rosa");
    expect(
      await database.selectFrom("member_name_claims").selectAll().execute(),
    ).toEqual([]);
    expect(await database.selectFrom("people").selectAll().execute()).toEqual(
      [],
    );
  } finally {
    await database.destroy();
  }
});

it("serializes competing claims through two independent database connections", async () => {
  const path = join(directory, "catalog.db");
  const first = createDatabase(path);
  await migrateToLatest(first);
  const memberIds = [await insertMember(first), await insertMember(first)];
  try {
    const code = `import {createDatabase} from './src/db/client.ts'; import {runInImmediateTransaction} from './src/db/runInImmediateTransaction.ts'; import {claimMemberName} from './src/members/claimMemberName.ts'; const database=createDatabase(process.argv[1]); try {await runInImmediateTransaction({database,callback:transaction=>claimMemberName({transaction,memberId:process.argv[2],displayName:'John',now:'2026-10-31'})}); console.log('won');} catch(error){console.log(error.code);}finally{await database.destroy();}`;
    const results = await Promise.all(
      memberIds.map((memberId) => {
        return promisify(execFile)(process.execPath, [
          "--input-type=module",
          "-e",
          code,
          path,
          memberId,
        ]);
      }),
    );
    expect(
      results.filter((result) => {
        return result.stdout.trim() === "won";
      }),
    ).toHaveLength(1);
    expect(
      results
        .find((result) => {
          return result.stdout.trim() !== "won";
        })
        ?.stdout.trim(),
    ).toBe("name_taken");
    expect(
      await first.selectFrom("member_name_claims").selectAll().execute(),
    ).toHaveLength(1);
  } finally {
    await first.destroy();
  }
});

it("keeps first profile completion and permanent ownership after removal", async () => {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  try {
    const memberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const claim = (displayName: string, now: string) => {
      return runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return claimMemberName({ transaction, memberId, displayName, now });
        },
      });
    };
    await claim("First name", "2026-10-01");
    await claim("Second name", "2026-10-31");
    expect(
      (
        await database
          .selectFrom("members")
          .select("profile_completed_at")
          .where("id", "=", memberId)
          .executeTakeFirst()
      )?.profile_completed_at,
    ).toBe("2026-10-01");
    await database
      .updateTable("members")
      .set({ status: "removed" })
      .where("id", "=", memberId)
      .execute();
    await expect(
      runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return claimMemberName({
            transaction,
            memberId: otherMemberId,
            displayName: "First name",
            now: "2026-10-31",
          });
        },
      }),
    ).rejects.toMatchObject({ code: "name_taken" });
  } finally {
    await database.destroy();
  }
});
