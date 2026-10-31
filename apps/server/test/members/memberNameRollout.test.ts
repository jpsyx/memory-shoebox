import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import SQLite from "better-sqlite3";
import { expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";

const script = fileURLToPath(
  new URL("../../scripts/memberNames.ts", import.meta.url),
);
function cli(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "name-rollout-"));
  const path = join(directory, "catalog.db");
  const database = createDatabase(path);
  const sources = await getMigrationSourcesFromFiles();
  await migrateToLatest(database, {
    sources: Object.fromEntries(
      Object.entries(sources).filter(([name]) => {
        return name < "0019";
      }),
    ),
  });
  const first = await insertMember(database, { display_name: "John" });
  const second = await insertMember(database, { display_name: " JOHN " });
  await database.destroy();
  return { directory, path, first, second };
}

it("shows complete root/subcommand help before any file access, with clean stdout", () => {
  for (const action of [[], ["audit"], ["stage"]]) {
    const result = cli([...action, "--database", "/does/not/exist", "--help"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("--database");
    expect(result.stdout).toContain("Examples");
    expect(result.stderr).toBe("");
  }
});

it("keeps audit read-only, reports collisions, and stages across process reopen with a verified backup", async () => {
  const fixtureData = await fixture();
  const { directory, path, first, second } = fixtureData;
  try {
    const before = readFileSync(path);
    const audit = cli(["audit", "--database", path]);
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
    const staged = cli([
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
    const repeatedAudit = JSON.parse(cli(["audit", "--database", path]).stdout);
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
  const { directory, path, first, second } = await fixture();
  try {
    const report = JSON.parse(cli(["audit", "--database", path]).stdout);
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
      const result = cli([
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
        cli(["stage", "--database", path, "--assignments", assignmentPath])
          .status,
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

it("fails missing unattended arguments promptly with usage and recovery advice", () => {
  const result = cli(["stage"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Usage:");
  expect(result.stderr).toContain("\n  ⚠️");
});

it("revalidates a staged snapshot before migration and rolls back on late migration failure", async () => {
  const { directory, path, first, second } = await fixture();
  try {
    const report = JSON.parse(cli(["audit", "--database", path]).stdout);
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
      cli(["stage", "--database", path, "--assignments", assignmentPath])
        .status,
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

function terminalSession(keys: string[], prompts: string[]) {
  const python = `import os, pty, select, subprocess, sys, time, json
master, slave = pty.openpty()
os.set_blocking(master,False)
def session():
 os.setsid()
 import fcntl, termios
 fcntl.ioctl(slave,termios.TIOCSCTTY,0)
process = subprocess.Popen([sys.argv[1],sys.argv[2]],stdin=slave,stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=session)
os.close(slave)
transcript=b""
try:
 for prompt, keys in zip(json.loads(sys.argv[3]),json.loads(sys.argv[4])):
  segment=b""
  deadline=time.monotonic()+5
  while prompt.encode() not in segment and time.monotonic()<deadline:
   if select.select([master],[],[],0.05)[0]:
    try:
     data=os.read(master,65536)
     transcript+=data
     segment+=data
    except OSError: break
  if prompt.encode() not in segment: raise RuntimeError('Missing prompt '+prompt+' '+repr(transcript))
  os.write(master,keys.encode())
 deadline=time.monotonic()+5
 while process.poll() is None and time.monotonic()<deadline:
  if select.select([master],[],[],0.05)[0]:
   try: transcript+=os.read(master,65536)
   except OSError: break
 try:
  out,err=process.communicate(timeout=1)
 except subprocess.TimeoutExpired:
  process.kill()
  process.wait(timeout=1)
  raise RuntimeError(repr(transcript))
  raise RuntimeError(repr(transcript)+' '+repr(out)+' '+repr(err))
 print(json.dumps({'status':process.returncode,'stdout':out.decode(),'stderr':err.decode(),'terminal':transcript.decode()}))
finally:
 if process.poll() is None: process.kill()
 os.close(master)
`;
  const result = spawnSync(
    "python3",
    [
      "-c",
      python,
      process.execPath,
      script,
      JSON.stringify(prompts),
      JSON.stringify(keys),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

it("offers the bare-command action wizard with j/k and arrow navigation and clean cancellation", () => {
  const result = terminalSession(
    ["j", "k", "\u001b[B", "\u001b[A", "\u0003"],
    [
      "Member name rollout",
      "> Stage assignments",
      "> Audit names",
      "> Stage assignments",
      "> Audit names",
    ],
  );
  expect(result.status).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Cancelled");
  expect(result.terminal).toContain("> Audit names");
  expect(result.terminal).toContain("Stage assignments");
});

it("asks all stage wizard values and cancels before any catalog access", () => {
  const result = terminalSession(
    ["j\r", "/does/not/exist\r", "/no/choices.json\r", "\r"],
    [
      "Member name rollout",
      "Existing catalog path",
      "Assignments JSON file",
      "Are all application processes stopped?",
    ],
  );
  expect(result.status).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("Validating");
});

it("cancels promptly on Ctrl-C and EOF without side effects", () => {
  for (const key of ["\u0003", "\u0004"]) {
    const result = terminalSession([key], ["Member name rollout"]);
    expect(result.status).toBe(130);
    expect(result.stdout).toBe("");
  }
});

it("keeps the full wizard plain with NO_COLOR while completing an offline stage", async () => {
  const { directory, path, first, second } = await fixture();
  try {
    const report = JSON.parse(cli(["audit", "--database", path]).stdout);
    const assignmentsPath = join(directory, "operator choices.json");
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
    const result = terminalSession(
      ["j\r", `${path}\r`, `${assignmentsPath}\r`, "j\r"],
      [
        "Member name rollout",
        "Existing catalog path",
        "Assignments JSON file",
        "Are all application processes stopped?",
      ],
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).staged).toBe(2);
    expect(result.terminal).not.toContain("\u001b[");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses stage on a contended write lock without creating backup or staging", async () => {
  const { directory, path, first, second } = await fixture();
  const lock = new SQLite(path);
  try {
    const report = JSON.parse(cli(["audit", "--database", path]).stdout);
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
    const result = cli([
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
