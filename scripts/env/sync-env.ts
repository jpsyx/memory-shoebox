import { fileURLToPath } from "node:url";
import {
  envPackageNames,
  getEnvTargetsFromArgv,
  syncEnvFiles,
  type EnvFileAction,
} from "./envFiles";

/**
 * `pnpm env:sync`: copies each environment file from the repository root into
 * the package that reads it.
 *
 * Every `pnpm dev` entry point runs this first, so `apps/server/.env.local`
 * and `apps/web/.env.local` are generated files: the root copy is the one
 * source, and editing a package copy loses the edit on the next run.
 *
 * A missing root file is reported rather than fatal, so somebody who has not
 * run `pnpm reset-env` yet still reaches the server's own startup error, which
 * names every variable it wants at once instead of one per restart.
 *
 * Usage: `pnpm env:sync [server|web]`
 */

/** The repository root, found from this file rather than from `process.cwd()`. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The one line printed when the arguments do not make sense. */
const USAGE = `Usage: pnpm env:sync [${envPackageNames().join("|")}]`;

/** One line per file, saying where it went or why it did not. */
function _lineFor(action: EnvFileAction): string {
  const name = `.env.${action.target.name}.local`;
  return action.outcome === "copied"
    ? `${name} copied into ${action.target.name}`
    : `${name} is not there yet, run pnpm reset-env`;
}

/** Runs the script when it is executed rather than imported. */
function _main(): void {
  const targets = getEnvTargetsFromArgv({
    argv: process.argv.slice(2),
    repositoryRoot: REPOSITORY_ROOT,
  });
  if (targets === undefined) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const actions = syncEnvFiles({ targets });
  process.stdout.write(`${actions.map(_lineFor).join("\n")}\n`);
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main();
}
