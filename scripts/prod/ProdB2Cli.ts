import { fileURLToPath } from "node:url";
import { runProductionB2 } from "./productionCommands/productionCommands";

try {
  process.exitCode = await runProductionB2({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    args: process.argv.slice(2),
  });
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Production B2 failed"}\n`,
  );
  process.exitCode = 1;
}
