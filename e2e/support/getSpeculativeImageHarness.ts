import { readFile } from "node:fs/promises";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

/** Transpiles the real native-image primitive only into the isolated fixture. */
export async function getSpeculativeImageHarness(): Promise<string> {
  const source = await readFile(
    new URL(
      "../../apps/web/src/media/loadSpeculativeMedia.ts",
      import.meta.url,
    ),
    "utf8",
  );
  return transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
  }).outputText;
}
