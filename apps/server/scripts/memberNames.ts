import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { ReadStream, WriteStream } from "node:tty";
import { fileURLToPath } from "node:url";
import type { DatabaseExecutor } from "../src/db/types/db.types.ts";

/** Single source for root/subcommand help; evaluated before opening any catalog. */
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
/** One semantic theme with stream-specific plain output. */
const THEME = {
  heading: "97",
  info: "36",
  success: "32",
  error: "31",
  warning: "33",
  selection: "1;32",
  prompt: "97",
} as const;
function _color(
  message: string,
  kind: keyof typeof THEME,
  stream: NodeJS.WriteStream = process.stderr,
): string {
  return stream.isTTY &&
    !process.env["NO_COLOR"] &&
    process.env["TERM"] !== "dumb"
    ? `\u001b[${THEME[kind]}m${message}\u001b[0m`
    : message;
}
function _progress(message: string): void {
  process.stderr.write(`${_color(message, "info")}\n`);
}

type Action = "audit" | "stage";
type Arguments = {
  action: Action | undefined;
  databasePath: string | undefined;
  assignmentsPath: string | undefined;
};
type Terminal = Readonly<{
  input: ReadStream;
  output: WriteStream;
  close: () => void;
}>;
class Cancelled extends Error {}

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
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${option}.`);
    if (option === "--database" && !databasePath) databasePath = value;
    else if (option === "--assignments" && !assignmentsPath)
      assignmentsPath = value;
    else throw new Error(`Unknown or duplicate option: ${option}.`);
  }
  if (action === "audit" && assignmentsPath)
    throw new Error("audit does not accept --assignments.");
  return { action, databasePath, assignmentsPath };
}

function _openTerminal(): Terminal {
  let inputDescriptor: number | undefined;
  try {
    inputDescriptor = openSync("/dev/tty", "r");
    const outputDescriptor = openSync("/dev/tty", "w");
    const input = new ReadStream(inputDescriptor);
    const output = new WriteStream(outputDescriptor);
    return {
      input,
      output,
      close: () => {
        input.setRawMode(false);
        input.destroy();
        output.destroy();
      },
    };
  } catch {
    if (inputDescriptor !== undefined) closeSync(inputDescriptor);
    throw new Error(
      "Missing required arguments and no controlling terminal is available.",
    );
  }
}

function _renderChoice(
  terminal: Terminal,
  label: string,
  choices: readonly string[],
  selected: number,
): void {
  terminal.output.write(
    `${_color(label, "heading", terminal.output)}\n${choices
      .map((choice, index) => {
        return index === selected
          ? _color(`> ${choice}`, "selection", terminal.output)
          : `  ${choice}`;
      })
      .join("\n")}\n`,
  );
}

function _prepareTerminalInput(input: ReadStream): void {
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
}

function _getSelectionFromKey(
  key: Readonly<{ name?: string; ctrl?: boolean }>,
  selected: number,
  count: number,
): number | "cancel" | "confirm" {
  if (
    (key.ctrl && ["c", "d"].includes(key.name ?? "")) ||
    key.name === "escape"
  )
    return "cancel";
  if (key.name === "return") return "confirm";
  if (["up", "k"].includes(key.name ?? ""))
    return (selected - 1 + count) % count;
  if (["down", "j"].includes(key.name ?? "")) return (selected + 1) % count;
  return selected;
}

async function _choose(
  terminal: Terminal,
  label: string,
  choices: readonly string[],
): Promise<number> {
  const { input, output } = terminal;
  let selected = 0;
  _prepareTerminalInput(input);
  _renderChoice(terminal, label, choices, selected);
  return new Promise((accept, reject) => {
    const finish = (error?: Error) => {
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.setRawMode(false);
      input.pause();
      if (error) reject(error);
      else accept(selected);
    };
    const onEnd = finish.bind(undefined, new Cancelled("Cancelled."));
    const onKey = (
      _value: string,
      key: Readonly<{ name?: string; ctrl?: boolean }>,
    ) => {
      const selection = _getSelectionFromKey(key, selected, choices.length);
      if (selection === "cancel") {
        finish(new Cancelled("Cancelled."));
        return;
      }
      if (selection === "confirm") {
        finish();
        return;
      }
      if (selection === selected) return;
      selected = selection;
      // Plain mode preserves selection states without cursor control sequences.
      if (
        output.isTTY &&
        !process.env["NO_COLOR"] &&
        process.env["TERM"] !== "dumb"
      )
        output.write(`\u001b[${choices.length + 1}A\u001b[J`);
      _renderChoice(terminal, label, choices, selected);
    };
    input.on("keypress", onKey);
    input.on("end", onEnd);
  });
}

async function _ask(terminal: Terminal, label: string): Promise<string> {
  const { input, output } = terminal;
  let answer = "";
  _prepareTerminalInput(input);
  output.write(`${_color(label, "prompt", output)}: `);
  return new Promise((accept, reject) => {
    const finish = (error?: Error) => {
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else accept(answer.trim());
    };
    const onEnd = finish.bind(undefined, new Cancelled("Cancelled."));
    const onKey = (
      value: string,
      key: Readonly<{ name?: string; ctrl?: boolean; meta?: boolean }>,
    ) => {
      if (key.ctrl && ["c", "d"].includes(key.name ?? "")) {
        finish(new Cancelled("Cancelled."));
        return;
      }
      if (key.name === "return") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        answer = Array.from(answer).slice(0, -1).join("");
        output.write(`\n${label}: ${answer}`);
      } else if (!key.ctrl && !key.meta && value && !/\p{Cc}/u.test(value)) {
        answer += value;
        output.write(value);
      }
    };
    input.on("keypress", onKey);
    input.on("end", onEnd);
  });
}

type CompleteArguments = Readonly<{
  action: Action;
  databasePath: string;
  assignmentsPath: string | undefined;
}>;

async function _getActionFromTerminal(terminal: Terminal): Promise<Action> {
  const selected = await _choose(terminal, "Member name rollout", [
    "Audit names (read-only)",
    "Stage assignments (application stopped)",
    "Cancel",
  ]);
  if (selected === 2) throw new Cancelled("Cancelled.");
  return selected === 0 ? "audit" : "stage";
}

async function _getPathsFromTerminal(
  terminal: Terminal,
  args: Arguments,
  action: Action,
): Promise<CompleteArguments> {
  const databasePath =
    args.databasePath ??
    (await _ask(terminal, "Existing catalog path (required, no default)"));
  const assignmentsPath =
    action === "stage"
      ? (args.assignmentsPath ??
        (await _ask(terminal, "Assignments JSON file (required, no default)")))
      : undefined;
  if (!databasePath || (action === "stage" && !assignmentsPath))
    throw new Error("Required paths cannot be empty.");
  if (
    action === "stage" &&
    (await _choose(terminal, "Are all application processes stopped?", [
      "No, cancel",
      "Yes, stage assignments",
    ])) !== 1
  )
    throw new Cancelled("Cancelled.");
  return { action, databasePath, assignmentsPath };
}

async function _completeArguments(args: Arguments): Promise<CompleteArguments> {
  if (
    args.action &&
    args.databasePath &&
    (args.action === "audit" || args.assignmentsPath)
  ) {
    return {
      action: args.action,
      databasePath: args.databasePath,
      assignmentsPath: args.assignmentsPath,
    };
  }
  const terminal = _openTerminal();
  try {
    const action = args.action ?? (await _getActionFromTerminal(terminal));
    return await _getPathsFromTerminal(terminal, args, action);
  } finally {
    terminal.close();
  }
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
    if (existing.rows.length)
      throw new Error(
        "Catalog already has member name claims; use this command before migration 0019.",
      );
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
  if (error instanceof Cancelled) {
    process.stderr.write(
      `${_color("⚠️ Cancelled. No assignments staged.", "warning")}\n`,
    );
    process.exitCode = 130;
    return;
  }
  process.stderr.write(
    `${_color(`❌ member-names: ${error instanceof Error ? error.message : "Operation failed."}`, "error")}\n${_color("  ⚠️ Stop the application, rerun audit, fix the choices, and retry with explicit paths. Run --help for examples.", "warning")}\n${HELP}`,
  );
  process.exitCode = 1;
}

/** Run the offline operator command. Explicit values never open a terminal. */
export async function runMemberNames(args: readonly string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(_color(HELP, "heading", process.stdout));
    return;
  }
  try {
    const options = await _completeArguments(_parseArguments(args));
    const result = await _runAction(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(
      `${_color("✅ Member name " + options.action + " complete.", "success")}\n`,
    );
  } catch (error) {
    _reportFailure(error);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runMemberNames(process.argv.slice(2));
