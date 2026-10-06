import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function _getOriginFromServer(server: ChildProcess): Promise<string> {
  return new Promise((settle, fail) => {
    let output = "";
    const timer = setTimeout(() => {
      fail(new Error(`Vite did not start: ${output}`));
    }, 30_000);
    server.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const origin = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (origin) {
        clearTimeout(timer);
        settle(origin);
      }
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    server.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`Vite exited (${code}): ${output}`));
    });
  });
}

async function _stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }
  await new Promise<void>((settle) => {
    server.once("exit", () => {
      settle();
    });
    server.kill("SIGTERM");
  });
}

/** Starts the real app with a fresh dependency cache and an isolated API. */
export async function createColdViteServer(apiOrigin: string): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-preview-vite-"));
  const configPath = join(directory, "vite.config.mjs");
  const webRoot = fileURLToPath(new URL("../../../apps/web/", import.meta.url));
  const originalConfig = join(webRoot, "vite.config.ts");
  await writeFile(
    configPath,
    `import config from ${JSON.stringify(originalConfig)};
export default { ...config, cacheDir: ${JSON.stringify(join(directory, "cache"))},
  server: { ...config.server, port: 0, host: "127.0.0.1",
    proxy: { "/api": { target: ${JSON.stringify(apiOrigin)}, changeOrigin: false } } } };
`,
  );
  const server = spawn(
    process.execPath,
    [join(webRoot, "node_modules/vite/bin/vite.js"), "--config", configPath],
    { cwd: webRoot, env: { ...process.env, NO_COLOR: "1" } },
  );
  const close = async () => {
    await _stopServer(server);
    await rm(directory, { recursive: true, force: true });
  };
  try {
    return { origin: await _getOriginFromServer(server), close };
  } catch (error) {
    await close();
    throw error;
  }
}
