import { execFileSync } from "node:child_process";

/** Build the compiled mail contract and production SPA before workers start. */
export default function setupBuild(): void {
  execFileSync("pnpm", ["build"], {
    stdio: "inherit",
    env: { ...process.env, WEB_BUILD_UPLOAD_PROOF: "false" },
  });
}
