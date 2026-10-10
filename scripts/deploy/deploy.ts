import { fileURLToPath } from "node:url";
import { deploy } from "./orchestration";

await deploy({ root: fileURLToPath(new URL("../../", import.meta.url)) }).catch(
  (error: unknown) => {
    process.stderr.write(
      `❌ ${error instanceof Error ? error.message : "Deployment failed"}\n`,
    );
    process.exitCode = 1;
  },
);
