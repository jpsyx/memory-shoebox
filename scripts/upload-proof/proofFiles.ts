import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Every file `pnpm upload:proof` will pick from a directory: its own regular
 * files, sorted, with no dotfile, no subdirectory and no symlink. Paths, never
 * copies: the browser reads the files where they are.
 *
 * A directory with nothing to pick is refused here, before a session is
 * minted: the harness ignores an empty pick, so the run would wait for an end
 * that never comes.
 *
 * @param directory The `--dir` as given.
 * @returns The absolute paths, or why there are none.
 */
export function getProofFilePathsFromDirectory(
  directory: string,
): { paths: string[] } | { problem: string } {
  const absolute = resolve(directory);
  if (statSync(absolute, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return { problem: `${directory} is not a directory.` };
  }
  const paths = readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => {
      // A Dirent for a symlink is not `isFile()`, whatever it points at.
      return entry.isFile() && !entry.name.startsWith(".");
    })
    .map((entry) => {
      return join(absolute, entry.name);
    })
    .sort();
  return paths.length === 0
    ? {
        problem: `${directory} has no files to pick. Dotfiles, subdirectories and symlinks are skipped.`,
      }
    : { paths };
}
