import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import SQLite from "better-sqlite3";
import { expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  createMemberNameRolloutFixture,
  runMemberNamesCli,
} from "./memberNameRolloutTestHelpers.ts";

it("keeps audit read-only, reports collisions, and stages across process reopen with a verified backup", async () => {
  const fixtureData = await createMemberNameRolloutFixture();
  const { directory, path, first, second } = fixtureData;
  try {
    const before = readFileSync(path);
    const audit = runMemberNamesCli(["audit", "--database", path]);
    expect(audit.status, audit.stderr).toBe(0);
    const report = JSON.parse(audit.stdout);
    expect(report.rows).toHaveLength(2);
    expect(
      report.rows.every((row: { issue: string }) => {
        return row.issue === "collision";
      }),
    ).toBe(true);
    expect(readFileSync(path)).toEqual(before);
    expect(audit.stderr).toContain("Auditing");
    const assignments = join(directory, "assignments.json");
    writeFileSync(
      assignments,
      JSON.stringify({
        catalogFingerprint: report.catalogFingerprint,
        assignments: [
          { memberId: first, displayName: "John M" },
          { memberId: second, displayName: "John R" },
        ],
      }),
    );
    const staged = runMemberNamesCli([
      "stage",
      "--database",
      path,
      "--assignments",
      assignments,
    ]);
    expect(staged.status, staged.stderr).toBe(0);
    const result = JSON.parse(staged.stdout);
    expect(staged.stderr).toContain("backup");
    expect(staged.stderr).toContain("✅");
    const backup = new SQLite(result.backupPath, { readonly: true });
    expect(backup.pragma("integrity_check")).toEqual([
      { integrity_check: "ok" },
    ]);
    expect(
      backup.prepare("select display_name from members where id=?").get(first),
    ).toEqual({ display_name: "John" });
    backup.close();
    expect(readdirSync(join(directory, "backups")).length).toBeGreaterThan(1);
    const repeatedAudit = JSON.parse(
      runMemberNamesCli(["audit", "--database", path]).stdout,
    );
    expect(repeatedAudit.catalogFingerprint).toBe(report.catalogFingerprint);
    const database = createDatabase(path);
    try {
      expect(
        (
          await database
            .selectFrom("members")
            .select("display_name")
            .where("id", "=", first)
            .executeTakeFirst()
        )?.display_name,
      ).toBe("John");
      await migrateToLatest(database);
      expect(
        (
          await database
            .selectFrom("members")
            .select("display_name")
            .where("id", "=", first)
            .executeTakeFirst()
        )?.display_name,
      ).toBe("John M");
      expect(
        (
          await sql`select name from sqlite_master where name='member_name_rollout_assignments'`.execute(
            database,
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await database.destroy();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses stale names or statuses, duplicate/unknown mappings, invalid names and unresolved collisions without staging", async () => {
  const { directory, path, first, second } =
    await createMemberNameRolloutFixture();
  try {
    const report = JSON.parse(
      runMemberNamesCli(["audit", "--database", path]).stdout,
    );
    const assignmentPath = join(directory, "choices.json");
    const choices = [
      { memberId: first, displayName: "John M" },
      { memberId: second, displayName: "John R" },
    ];
    const invalidInputs = [
      { catalogFingerprint: "stale", assignments: choices },
      {
        catalogFingerprint: report.catalogFingerprint,
        assignments: [choices[0], choices[0]],
      },
      {
        catalogFingerprint: report.catalogFingerprint,
        assignments: [...choices, { memberId: "unknown", displayName: "New" }],
      },
      {
        catalogFingerprint: report.catalogFingerprint,
        assignments: [{ memberId: first, displayName: "@bad" }, choices[1]],
      },
      { catalogFingerprint: report.catalogFingerprint, assignments: [] },
    ];
    for (const input of invalidInputs) {
      writeFileSync(assignmentPath, JSON.stringify(input));
      const result = runMemberNamesCli([
        "stage",
        "--database",
        path,
        "--assignments",
        assignmentPath,
      ]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("\n  ⚠️");
    }
    for (const column of ["display_name", "status"]) {
      const database = new SQLite(path);
      database
        .prepare(`update members set ${column}=? where id=?`)
        .run(column === "status" ? "removed" : "Changed", first);
      database.close();
      writeFileSync(
        assignmentPath,
        JSON.stringify({
          catalogFingerprint: report.catalogFingerprint,
          assignments: choices,
        }),
      );
      expect(
        runMemberNamesCli([
          "stage",
          "--database",
          path,
          "--assignments",
          assignmentPath,
        ]).status,
      ).toBe(1);
    }
    const database = new SQLite(path);
    expect(
      database
        .prepare(
          "select name from sqlite_master where name='member_name_rollout_assignments'",
        )
        .all(),
    ).toEqual([]);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("revalidates a staged snapshot before migration and rolls back on late migration failure", async () => {
  const { directory, path, first, second } =
    await createMemberNameRolloutFixture();
  try {
    const report = JSON.parse(
      runMemberNamesCli(["audit", "--database", path]).stdout,
    );
    const assignmentPath = join(directory, "choices.json");
    writeFileSync(
      assignmentPath,
      JSON.stringify({
        catalogFingerprint: report.catalogFingerprint,
        assignments: [
          { memberId: first, displayName: "John M" },
          { memberId: second, displayName: "John R" },
        ],
      }),
    );
    expect(
      runMemberNamesCli([
        "stage",
        "--database",
        path,
        "--assignments",
        assignmentPath,
      ]).status,
    ).toBe(0);
    const database = createDatabase(path);
    try {
      await database
        .updateTable("members")
        .set({ status: "removed" })
        .where("id", "=", first)
        .execute();
      const before = await database
        .selectFrom("members")
        .selectAll()
        .orderBy("id")
        .execute();
      await expect(migrateToLatest(database)).rejects.toThrow(/stale/i);
      expect(
        await database
          .selectFrom("members")
          .selectAll()
          .orderBy("id")
          .execute(),
      ).toEqual(before);
      await database
        .updateTable("members")
        .set({ status: "active" })
        .where("id", "=", first)
        .execute();
      await sql`create trigger fail_rollout before insert on people begin select raise(abort, 'late rollout failure'); end`.execute(
        database,
      );
      const schema = (
        await sql`select * from sqlite_master order by name`.execute(database)
      ).rows;
      const history = (
        await sql`select * from kysely_migration order by name`.execute(
          database,
        )
      ).rows;
      const members = await database
        .selectFrom("members")
        .selectAll()
        .orderBy("id")
        .execute();
      const staged = (
        await sql`select * from member_name_rollout_assignments`.execute(
          database,
        )
      ).rows;
      await expect(migrateToLatest(database)).rejects.toThrow(
        "late rollout failure",
      );
      expect(
        (await sql`select * from sqlite_master order by name`.execute(database))
          .rows,
      ).toEqual(schema);
      expect(
        (
          await sql`select * from kysely_migration order by name`.execute(
            database,
          )
        ).rows,
      ).toEqual(history);
      expect(
        await database
          .selectFrom("members")
          .selectAll()
          .orderBy("id")
          .execute(),
      ).toEqual(members);
      expect(
        (
          await sql`select * from member_name_rollout_assignments`.execute(
            database,
          )
        ).rows,
      ).toEqual(staged);
      expect(await database.selectFrom("people").selectAll().execute()).toEqual(
        [],
      );
    } finally {
      await database.destroy();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses stage on a contended write lock without creating backup or staging", async () => {
  const { directory, path, first, second } =
    await createMemberNameRolloutFixture();
  const lock = new SQLite(path);
  try {
    const report = JSON.parse(
      runMemberNamesCli(["audit", "--database", path]).stdout,
    );
    const assignmentsPath = join(directory, "choices.json");
    writeFileSync(
      assignmentsPath,
      JSON.stringify({
        catalogFingerprint: report.catalogFingerprint,
        assignments: [
          { memberId: first, displayName: "John M" },
          { memberId: second, displayName: "John R" },
        ],
      }),
    );
    const backupsBefore = readdirSync(join(directory, "backups"));
    lock.exec("begin immediate");
    const result = runMemberNamesCli([
      "stage",
      "--database",
      path,
      "--assignments",
      assignmentsPath,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("locked");
    expect(result.stdout).toBe("");
    expect(readdirSync(join(directory, "backups"))).toEqual(backupsBefore);
    lock.exec("rollback");
    expect(
      lock
        .prepare(
          "select name from sqlite_master where name='member_name_rollout_assignments'",
        )
        .all(),
    ).toEqual([]);
  } finally {
    lock.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
