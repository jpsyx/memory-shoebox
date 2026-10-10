import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// BuildKit mounts this file only for this RUN. Inject values directly, so
// shell expressions and dotenv interpolation cannot change public settings.
const webEnvironment = parseEnv(
  readFileSync(process.argv[2] ?? "/run/secrets/web_env", "utf8"),
);
if (
  Object.keys(webEnvironment).some((name) => {
    return !name.startsWith("VITE_");
  })
) {
  throw new Error(
    "Web build configuration must contain public VITE_ keys only",
  );
}
const result = spawnSync("pnpm", ["--filter", "@memory-shoebox/web", "build"], {
  env: { ...process.env, ...webEnvironment },
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
