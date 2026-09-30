import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One package's environment file, in the three places it lives.
 *
 * The example is committed and holds every key with no value. The root copy is
 * the one a person fills in, and it is the single source of truth. The package
 * copy is written from it and is never edited by hand, because `pnpm dev`
 * overwrites it.
 */
export type EnvTarget = {
  /** What `pnpm reset-env <name>` and `pnpm env:sync <name>` answer to. */
  name: string;
  /** The committed template: every key, no values. */
  examplePath: string;
  /** The file a person fills in, at the repository root. */
  rootPath: string;
  /** Where the package's own tooling reads it from. */
  packagePath: string;
};

/** What happened to one file, for the line the script prints. */
export type EnvFileAction = {
  target: EnvTarget;
  /**
   * `created` wrote a file, `kept` left one that was already there,
   * `copied` refreshed a package copy, and `no-source` means the root file
   * does not exist yet so nothing was touched.
   */
  outcome: "created" | "kept" | "copied" | "no-source";
};

/** Which packages keep an environment file, and what each one is called. */
const ENV_PACKAGES = [
  { name: "server", directory: "apps/server" },
  { name: "web", directory: "apps/web" },
] as const;

/**
 * Every environment file this repository manages, resolved against one root.
 *
 * It takes the root rather than reading `process.cwd()` so that a test can
 * point it at a temporary directory, and so a script run from a package
 * directory still finds the right files.
 */
export function getEnvTargetsFromRoot(repositoryRoot: string): EnvTarget[] {
  return ENV_PACKAGES.map((envPackage) => {
    return {
      name: envPackage.name,
      examplePath: join(repositoryRoot, envPackage.directory, ".env.example"),
      rootPath: join(repositoryRoot, `.env.${envPackage.name}.local`),
      packagePath: join(repositoryRoot, envPackage.directory, ".env.local"),
    };
  });
}

/**
 * Writes each root file from its example, so every key is there to fill in.
 *
 * **It does not overwrite by default, and that is the point.** These files
 * hold real secrets once somebody has filled them in, and a command called
 * `reset` that silently destroyed a filled-in session secret would be a bad
 * trade for the convenience. `force` is the deliberate way to start again.
 *
 * @param options.targets The files to write.
 * @param options.force Overwrite a file that is already there.
 * @returns What happened to each, in the order given.
 */
export function resetEnvFiles(
  options: Readonly<{ targets: readonly EnvTarget[]; force?: boolean }>,
): EnvFileAction[] {
  return options.targets.map((target) => {
    if (existsSync(target.rootPath) && options.force !== true) {
      return { target, outcome: "kept" as const };
    }
    copyFileSync(target.examplePath, target.rootPath);
    return { target, outcome: "created" as const };
  });
}

/**
 * Copies each root file down to where its package reads it.
 *
 * The root file is the one source, so this overwrites the package copy every
 * time rather than merging: two files that drift apart is the problem this
 * exists to remove. A missing root file is reported rather than thrown,
 * because `pnpm dev` runs this and a contributor who has not filled anything
 * in yet should still get as far as the error the server itself gives.
 *
 * @param options.targets The files to copy.
 * @returns What happened to each, in the order given.
 */
export function syncEnvFiles(
  options: Readonly<{ targets: readonly EnvTarget[] }>,
): EnvFileAction[] {
  return options.targets.map((target) => {
    if (!existsSync(target.rootPath)) {
      return { target, outcome: "no-source" as const };
    }
    copyFileSync(target.rootPath, target.packagePath);
    return { target, outcome: "copied" as const };
  });
}

/** The one line printed when the arguments do not make sense. */
export const ENV_FILES_USAGE =
  "Usage: tsx scripts/envFiles/envFiles.ts <reset|sync> [server|web] [--force]";

/** Everything the script needs, read from the command line. */
export type EnvFilesArguments = {
  command: "reset" | "sync";
  /** One package, or undefined for all of them. */
  name: string | undefined;
  force: boolean;
};

/**
 * Reads the command line, or refuses it.
 *
 * One walk rather than an `indexOf` per flag, for the reason
 * `apps/server/scripts/seedMember.ts` gives: a flag's value is consumed by its
 * flag and can never be mistaken for the command or the package name.
 *
 * @param argv The arguments after the script's own name.
 * @returns What to do, or undefined when the caller should print the usage.
 */
export function getEnvFilesArgumentsFromArgv(
  argv: readonly string[],
): EnvFilesArguments | undefined {
  // Every flag drops out, not only `--force`: `pnpm reset-env -- --force`
  // forwards the bare `--` separator too, and a positional walk that counted
  // it would refuse a command line that reads perfectly well.
  const words = argv.filter((argument) => {
    return !argument.startsWith("-");
  });
  const command = words[0];
  if (command !== "reset" && command !== "sync") {
    return undefined;
  }
  const name = words[1];
  if (words.length > 2 || (name !== undefined && !_isEnvPackageName(name))) {
    return undefined;
  }
  return { command, name, force: argv.includes("--force") };
}

/** Whether a word off the command line names a package that has env files. */
function _isEnvPackageName(value: string): boolean {
  return ENV_PACKAGES.some((envPackage) => {
    return envPackage.name === value;
  });
}

/** The repository root, found from this file rather than from `process.cwd()`. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** One line per file, saying what happened to it and where. */
function _reportActions(actions: readonly EnvFileAction[]): void {
  const lines = actions.map((action) => {
    const { target, outcome } = action;
    switch (outcome) {
      case "created":
        return `created .env.${target.name}.local, fill it in`;
      case "kept":
        return `.env.${target.name}.local is already there, left alone`;
      case "copied":
        return `.env.${target.name}.local copied into ${target.name}`;
      case "no-source":
        return `no .env.${target.name}.local yet, run pnpm reset-env`;
    }
  });
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Runs the script when it is executed rather than imported. */
function _main(): void {
  const environmentArguments = getEnvFilesArgumentsFromArgv(
    process.argv.slice(2),
  );
  if (environmentArguments === undefined) {
    process.stderr.write(`${ENV_FILES_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const { command, name, force } = environmentArguments;
  const targets = getEnvTargetsFromRoot(REPOSITORY_ROOT).filter((target) => {
    return name === undefined || target.name === name;
  });
  _reportActions(
    command === "reset"
      ? resetEnvFiles({ targets, force })
      : syncEnvFiles({ targets }),
  );
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main();
}
