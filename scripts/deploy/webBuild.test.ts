import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("injects literal public build values without executing shell expressions", () => {
  const directory = mkdtempSync(join(tmpdir(), "web-build-test-"));
  try {
    const secret = join(directory, "web.env");
    const output = join(directory, "result.json");
    writeFileSync(
      secret,
      "VITE_LABEL='literal $HOME $(touch unsafe) \\ quote\" # value'\n",
    );
    const executable = join(directory, "pnpm");
    writeFileSync(
      executable,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.BUILD_TEST_OUTPUT, JSON.stringify({label: process.env.VITE_LABEL, args: process.argv.slice(2)}));\n`,
    );
    chmodSync(executable, 0o700);
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./webBuild.ts", import.meta.url)), secret],
      {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          BUILD_TEST_OUTPUT: output,
        },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      label: 'literal $HOME $(touch unsafe) \\ quote" # value',
      args: ["--filter", "@memory-shoebox/web", "build"],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
