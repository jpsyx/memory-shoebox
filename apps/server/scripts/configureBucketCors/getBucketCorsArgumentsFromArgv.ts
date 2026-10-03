/**
 * Reads the command line, or refuses it. `--apply` is the only flag, and
 * without it the script only reports.
 *
 * @param argv The arguments after the script's own name.
 * @returns What to do, or undefined when the caller should print
 *   `BUCKET_CORS_USAGE` and stop.
 */
export function getBucketCorsArgumentsFromArgv(
  argv: readonly string[],
): { isApplying: boolean } | undefined {
  const isEveryArgumentKnown = argv.every((argument) => {
    return argument === "--apply";
  });
  return isEveryArgumentKnown
    ? { isApplying: argv.includes("--apply") }
    : undefined;
}
