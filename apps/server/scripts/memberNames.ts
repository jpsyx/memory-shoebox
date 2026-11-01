import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseExecutor } from "../src/db/types/db.types.ts";
import {
  completeMemberNamesArguments,
  MemberNamesCancelled,
  memberNamesMessage,
  type Action,
  type Arguments,
  type CompleteArguments,
} from "./memberNamesTerminalHelpers.ts";

/**
 * Single source for root/subcommand help; evaluated before opening any
 * catalog.
 */
const HELP = `Audit legacy member names or stage explicit choices for migration 0019.
Usage: node apps/server/scripts/memberNames.ts [audit|stage] [options]

Actions:
  audit   Open an existing catalog read-only and print the collision report as JSON.
  stage   Validate choices, save a verified backup, and stage choices without renaming.
          Stop every application process first. Explicit stage asserts it is stopped.
  (none)  Open an action wizard; Ctrl-C, EOF or Cancel exits without staging.

Options:
  --database <path>    Required existing SQLite catalog. No unattended default.
  --assignments <json> Required for stage: path to a UTF-8 JSON file containing
                       {catalogFingerprint, assignments:[{memberId, displayName}]}.
  -h, --help          Show this help before accessing files or prompting.

Output: audit prints {rows,catalogFingerprint}; stage prints {backupPath,staged}.
Progress and recovery instructions use stderr. Backups are kept in backups/
beside the catalog; names are generated automatically. No other options/defaults.

Examples:
  node apps/server/scripts/memberNames.ts audit --database /data/catalog.db > audit.json
  node apps/server/scripts/memberNames.ts stage --database /data/catalog.db --assignments choices.json
`;

function _progress(message: string): void {
  process.stderr.write(`${memberNamesMessage(message, "info")}\n`);
}

function _parseArguments(args: readonly string[]): Arguments {
  let action: Action | undefined;
  let databasePath: string | undefined;
  let assignmentsPath: string | undefined;
  const remaining = [...args];
  const first = remaining[0];
  if (first === "audit" || first === "stage") {
    action = first;
    remaining.shift();
  }
  while (remaining.length) {
    const option = remaining.shift();
    const value = remaining.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}.`);
    }
    if (option === "--database" && !databasePath) {
      databasePath = value;
    } else if (option === "--assignments" && !assignmentsPath) {
      assignmentsPath = value;
    } else {
      throw new Error(`Unknown or duplicate option: ${option}.`);
    }
  }
  if (action === "audit" && assignmentsPath) {
    throw new Error("audit does not accept --assignments.");
  }
  return { action, databasePath, assignmentsPath };
}

async function _openDatabase(
  path: string,
  isReadonly: boolean,
): Promise<DatabaseExecutor> {
  const [{ default: SQLite }, { Kysely, SqliteDialect }] = await Promise.all([
    import("better-sqlite3"),
    import("kysely"),
  ]);
  const sqlite = new SQLite(path, {
    readonly: isReadonly,
    fileMustExist: true,
    timeout: 1000,
  });
  sqlite.pragma("foreign_keys = ON");
  return new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
}

async function _backupCatalog(path: string): Promise<string> {
  const { backupDatabase } = await import("../src/db/backupDatabase.ts");
  const directory = join(dirname(path), "backups");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const backupPath = join(
    directory,
    `${basename(path)}.member-names.${Date.now()}.${randomUUID()}.db`,
  );
  _progress(`Creating verified backup: ${backupPath}`);
  const heartbeat = setInterval(() => {
    return _progress("Still creating and verifying the catalog backup.");
  }, 5000);
  heartbeat.unref();
  try {
    await backupDatabase(path, backupPath);
  } finally {
    clearInterval(heartbeat);
  }
  return backupPath;
}

async function _writeStaging(
  transaction: DatabaseExecutor,
  input: unknown,
): Promise<void> {
  const { sql } = await import("kysely");
  _progress("Staging validated assignments. Member names remain unchanged.");
  await sql`create table if not exists member_name_rollout_assignments (payload text not null)`.execute(
    transaction,
  );
  await sql`delete from member_name_rollout_assignments`.execute(transaction);
  await sql`insert into member_name_rollout_assignments (payload) values (${JSON.stringify(input)})`.execute(
    transaction,
  );
}

async function _stage(
  database: DatabaseExecutor,
  path: string,
  assignmentsPath: string,
): Promise<{ backupPath: string; staged: number }> {
  const [
    { runInImmediateTransaction },
    { getLegacyRolloutFromDatabase, getFinalNamesFromRollout },
  ] = await Promise.all([
    import("../src/db/runInImmediateTransaction.ts"),
    import("../src/db/migrations/0019_member_name_claims.ts"),
  ]);
  const input: unknown = JSON.parse(readFileSync(assignmentsPath, "utf8"));
  return runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const rollout = await getLegacyRolloutFromDatabase(transaction);
      const names = getFinalNamesFromRollout(rollout, input);
      const backupPath = await _backupCatalog(path);
      await _writeStaging(transaction, input);
      return { backupPath, staged: names.size };
    },
  });
}

async function _runAction(options: CompleteArguments): Promise<unknown> {
  _progress(
    options.action === "audit"
      ? "Auditing legacy member names (read-only)."
      : "Validating stopped catalog and assignments.",
  );
  const database = await _openDatabase(
    options.databasePath,
    options.action === "audit",
  );
  try {
    const { sql } = await import("kysely");
    const existing =
      await sql`select name from sqlite_master where name='member_name_claims'`.execute(
        database,
      );
    if (existing.rows.length) {
      throw new Error(
        "Catalog already has member name claims; use this command before migration 0019.",
      );
    }
    const { readMemberNameRollout } =
      await import("../src/members/readMemberNameRollout.ts");
    return options.action === "audit"
      ? await readMemberNameRollout(database)
      : await _stage(database, options.databasePath, options.assignmentsPath!);
  } finally {
    await database.destroy();
  }
}

function _reportFailure(error: unknown): void {
  if (error instanceof MemberNamesCancelled) {
    process.stderr.write(
      `${memberNamesMessage("⚠️ MemberNamesCancelled. No assignments staged.", "warning")}\n`,
    );
    process.exitCode = 130;
    return;
  }
  process.stderr.write(
    `${memberNamesMessage(`❌ member-names: ${error instanceof Error ? error.message : "Operation failed."}`, "error")}\n${memberNamesMessage("  ⚠️ Stop the application, rerun audit, fix the choices, and retry with explicit paths. Run --help for examples.", "warning")}\n${HELP}`,
  );
  process.exitCode = 1;
}

/** Run the offline operator command. Explicit values never open a terminal. */
export async function runMemberNames(args: readonly string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(memberNamesMessage(HELP, "heading", process.stdout));
    return;
  }
  try {
    const options = await completeMemberNamesArguments(_parseArguments(args));
    const result = await _runAction(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(
      `${memberNamesMessage("✅ Member name " + options.action + " complete.", "success")}\n`,
    );
  } catch (error) {
    _reportFailure(error);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMemberNames(process.argv.slice(2));
}
