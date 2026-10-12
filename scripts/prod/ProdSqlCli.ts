import { fileURLToPath } from "node:url";
import { runProductionSql } from "./productionCommands/productionCommands";

try {
  process.exitCode = await runProductionSql({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    args: process.argv.slice(2),
  });
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Production SQL failed"}\n`,
  );
  process.exitCode = 1;
}
