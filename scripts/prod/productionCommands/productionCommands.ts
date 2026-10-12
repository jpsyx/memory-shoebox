import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { makeEnvFromText } from "../../deploy/environmentHelpers/environmentHelpers";
import type { Environment } from "../../deploy/environmentHelpers/environmentHelpers";
import { runAttachedCommand } from "../runAttachedCommand/runAttachedCommand";
import type { AttachedRunner } from "../runAttachedCommand/runAttachedCommand";

/** Local inputs and an optional offline process boundary. */
type ProductionOptions = {
  root: string;
  args: readonly string[];
  runner?: AttachedRunner;
  log?: (message: string) => void;
};

/** SQL wrapper syntax; B2 keeps the upstream CLI's own help. */
const SQL_USAGE: string = `Usage: pnpm prod:sql [--readonly] ["SQL"]
With no SQL, opens the production sqlite3 shell. Exit with .quit.
Reads FLY_APP / FLY_API_TOKEN from .env.deploy and DATABASE_PATH from
.env.server.production. Requires local fly and sqlite3 in the deployed image.`;

function _getEnvFromFile(
  options: Readonly<{
    root: string;
    name: string;
    requiredKeys: readonly string[];
  }>,
): Environment {
  const filePath = join(options.root, options.name);
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${options.name} in the repository root.`);
  }
  const env = makeEnvFromText(readFileSync(filePath, "utf8"));
  const missing = options.requiredKeys.filter((key) => {
    return !env[key]?.trim();
  });
  if (missing.length > 0) {
    throw new Error(`${options.name}: missing or blank ${missing.join(", ")}`);
  }
  return env;
}

function _getArgsFromArgv(argv: readonly string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : [...argv];
}

function _makeShellWordFromText(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function _makeSqlCommandFromArgs(
  options: Readonly<{
    databasePath: string;
    args: readonly string[];
  }>,
): string {
  const isReadonly = options.args[0] === "--readonly";
  const queries = isReadonly ? options.args.slice(1) : options.args;
  if (queries.length > 1 || (queries[0] !== undefined && !queries[0].trim())) {
    throw new Error(`Pass the SQL as one quoted argument.\n${SQL_USAGE}`);
  }
  const database = _makeShellWordFromText(options.databasePath);
  const sqliteArgs = [
    "sqlite3",
    "-bail",
    "-cmd",
    ".timeout 5000",
    ...(isReadonly ? ["-readonly"] : []),
    ...(queries[0] === undefined ? [] : ["-cmd", queries[0]]),
    options.databasePath,
    ...(queries[0] === undefined ? [] : [""]),
  ];
  const script = [
    `test -f ${database} || { echo 'Configured DATABASE_PATH is not an existing file.' >&2; exit 1; }`,
    "command -v sqlite3 >/dev/null || { echo 'sqlite3 is missing from this image. Deploy the updated image with pnpm prod:deploy.' >&2; exit 127; }",
    `exec ${sqliteArgs.map(_makeShellWordFromText).join(" ")}`,
  ].join("; ");
  return `sh -c ${_makeShellWordFromText(script)}`;
}

function _getSqlConnectionFromRoot(root: string): {
  app: string;
  databasePath: string;
  env: NodeJS.ProcessEnv;
} {
  const operator = _getEnvFromFile({
    root,
    name: ".env.deploy",
    requiredKeys: ["FLY_APP"],
  });
  const server = _getEnvFromFile({
    root,
    name: ".env.server.production",
    requiredKeys: ["DATABASE_PATH"],
  });
  const databasePath = server.DATABASE_PATH!;
  if (!isAbsolute(databasePath)) {
    throw new Error(".env.server.production: DATABASE_PATH must be absolute.");
  }
  return {
    app: operator.FLY_APP!,
    databasePath,
    env: {
      ...process.env,
      FLY_API_TOKEN: operator.FLY_API_TOKEN || undefined,
      FLY_ACCESS_TOKEN: undefined,
    },
  };
}

/** Runs SQL over Fly SSH, allocating a terminal for the no-query shell. */
export async function runProductionSql(
  options: Readonly<ProductionOptions>,
): Promise<number> {
  const args = _getArgsFromArgv(options.args);
  if (args[0] === "--help" || args[0] === "-h") {
    (options.log ?? console.log)(SQL_USAGE);
    return 0;
  }
  const connection = _getSqlConnectionFromRoot(options.root);
  const command = _makeSqlCommandFromArgs({
    databasePath: connection.databasePath,
    args,
  });
  const hasQuery = args.length > (args[0] === "--readonly" ? 1 : 0);
  return (options.runner ?? runAttachedCommand)({
    executable: "fly",
    args: [
      "ssh",
      "console",
      "--app",
      connection.app,
      "--process-group",
      "app",
      ...(!hasQuery ? ["--pty"] : []),
      "--command",
      command,
    ],
    env: connection.env,
  });
}

/** Runs B2 with production credentials and a disposable local auth cache. */
export async function runProductionB2(
  options: Readonly<ProductionOptions>,
): Promise<number> {
  const server = _getEnvFromFile({
    root: options.root,
    name: ".env.server.production",
    requiredKeys: ["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET"],
  });
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => {
      return !key.startsWith("B2_");
    }),
  );
  const production = Object.fromEntries(
    Object.entries(server).filter(([key]) => {
      return key.startsWith("B2_");
    }),
  );
  const cacheDirectory = mkdtempSync(join(tmpdir(), "shoebox-prod-b2-"));
  try {
    return await (options.runner ?? runAttachedCommand)({
      executable: "b2",
      args: _getArgsFromArgv(options.args),
      env: {
        ...inherited,
        ...production,
        B2_APPLICATION_KEY_ID: server.B2_KEY_ID,
        B2_KEY_PREFIX: server.B2_KEY_PREFIX ?? "production",
        B2_ACCOUNT_INFO: join(cacheDirectory, "account.sqlite"),
        XDG_CONFIG_HOME: cacheDirectory,
      },
    });
  } finally {
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
}
