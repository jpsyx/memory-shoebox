import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeMergedEnvFromExample } from "./mergeEnvExample";

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
  /** The example's path as a person would write it, for the divider. */
  exampleLabel: string;
};

/** What happened to one file, for the line the script prints. */
export type EnvFileAction = {
  target: EnvTarget;
  /**
   * `created` wrote a whole file, `merged` added the example's new keys to
   * one that was already there, `unchanged` found nothing to add, `copied`
   * refreshed a package copy, and `no-source` means there is no root file yet
   * so nothing was touched.
   */
  outcome: "created" | "merged" | "unchanged" | "copied" | "no-source";
  /** The keys a merge brought across. Empty for every other outcome. */
  addedKeys: string[];
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
      exampleLabel: `${envPackage.directory}/.env.example`,
    };
  });
}

/**
 * Brings each root file up to date with its example, keeping every value.
 *
 * **Merging rather than refusing is the default, and overwriting is not.** A
 * file that is already there has real secrets in it, so the example's new keys
 * are appended with the comments that explain them and nothing already written
 * is touched. `force` throws the file away and starts from the example, which
 * is occasionally what somebody wants and never what they want by accident.
 *
 * @param options.targets The files to bring up to date.
 * @param options.force Replace the file wholesale instead of merging.
 * @returns What happened to each, in the order given.
 */
export function resetEnvFiles(
  options: Readonly<{ targets: readonly EnvTarget[]; force?: boolean }>,
): EnvFileAction[] {
  return options.targets.map((target) => {
    const example = readFileSync(target.examplePath, "utf8");
    if (!existsSync(target.rootPath) || options.force === true) {
      writeFileSync(target.rootPath, example);
      return { target, outcome: "created" as const, addedKeys: [] };
    }

    const merged = makeMergedEnvFromExample({
      example,
      local: readFileSync(target.rootPath, "utf8"),
      exampleLabel: target.exampleLabel,
    });
    if (merged.addedKeys.length === 0) {
      return { target, outcome: "unchanged" as const, addedKeys: [] };
    }
    writeFileSync(target.rootPath, merged.contents);
    return {
      target,
      outcome: "merged" as const,
      addedKeys: merged.addedKeys,
    };
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
      return { target, outcome: "no-source" as const, addedKeys: [] };
    }
    copyFileSync(target.rootPath, target.packagePath);
    return { target, outcome: "copied" as const, addedKeys: [] };
  });
}

/**
 * The targets a command line names, or undefined when it names nothing real.
 *
 * Flags are dropped before the walk rather than counted, because
 * `pnpm reset-env -- --force` forwards pnpm's bare `--` separator too, and a
 * positional read that counted it would refuse a command line that reads
 * perfectly well.
 *
 * @param options.argv The arguments after the script's own name.
 * @param options.repositoryRoot Where the files live.
 * @returns Every target, or the one named, or undefined for an unknown name.
 */
export function getEnvTargetsFromArgv(
  options: Readonly<{ argv: readonly string[]; repositoryRoot: string }>,
): EnvTarget[] | undefined {
  const words = options.argv.filter((argument) => {
    return !argument.startsWith("-");
  });
  if (words.length > 1) {
    return undefined;
  }

  const targets = getEnvTargetsFromRoot(options.repositoryRoot);
  const name = words[0];
  if (name === undefined) {
    return targets;
  }
  const named = targets.filter((target) => {
    return target.name === name;
  });
  return named.length === 0 ? undefined : named;
}

/** Whether a command line asked for the file to be replaced wholesale. */
export function hasForceFlag(argv: readonly string[]): boolean {
  return argv.includes("--force");
}

/** The names a command line may narrow to, for the usage line. */
export function envPackageNames(): string[] {
  return ENV_PACKAGES.map((envPackage) => {
    return envPackage.name;
  });
}
