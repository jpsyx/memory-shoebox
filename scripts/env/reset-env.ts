import { fileURLToPath } from "node:url";
import {
  envPackageNames,
  getEnvTargetsFromArgv,
  resetEnvFiles,
  type EnvFileAction,
} from "./envFiles";

/**
 * `pnpm reset-env`: brings the environment files at the repository root up to
 * date with each app's committed `.env.example`.
 *
 * **It merges, and it never overwrites a value.** A key the example has gained
 * is appended with the comment lines that explain it; everything already in
 * the file is left exactly as it was. That makes the command safe to run at
 * any time, which is the point: it is how somebody finds out that a new
 * variable is needed, rather than by a server refusing to start.
 *
 * `--force` replaces the file wholesale from the example, throwing away
 * whatever was there. It exists for the rare case and is never the default.
 *
 * Usage: `pnpm reset-env [server|web] [-- --force]`
 */

/** The repository root, found from this file rather than from `process.cwd()`. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The one line printed when the arguments do not make sense. */
const USAGE = `Usage: pnpm reset-env [${envPackageNames().join("|")}] [-- --force]`;

/** One line per file, saying what it gained and what it kept. */
function _lineFor(action: EnvFileAction): string {
  const name = `.env.${action.target.name}.local`;
  switch (action.outcome) {
    case "created":
      return `${name} written from the example, fill it in`;
    case "merged":
      return `${name} gained ${action.addedKeys.join(", ")}, your values kept`;
    case "unchanged":
      return `${name} already has every key`;
    default:
      return `${name} unchanged`;
  }
}

/** Runs the script when it is executed rather than imported. */
function _main(): void {
  const argv = process.argv.slice(2);
  const targets = getEnvTargetsFromArgv({
    argv,
    repositoryRoot: REPOSITORY_ROOT,
  });
  if (targets === undefined) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const actions = resetEnvFiles({ targets, force: argv.includes("--force") });
  process.stdout.write(`${actions.map(_lineFor).join("\n")}\n`);
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main();
}
