import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";

type SetupResult = {
  kind: "result";
  statusCode: number;
  error?: string;
  hasCookie: boolean;
};
type SetupProcess = {
  child: ChildProcess;
  ready: Promise<void>;
  result: Promise<SetupResult>;
  closed: Promise<void>;
};

function _startSetupProcess(databasePath: string): SetupProcess {
  const child = fork(
    new URL("./setupConcurrency.worker.ts", import.meta.url),
    [databasePath],
    { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const ready = _getMessageFromSetupProcess({
    child,
    kind: "ready",
    getStderr: () => {
      return stderr;
    },
  }).then(() => {});
  const result = _getMessageFromSetupProcess({
    child,
    kind: "result",
    getStderr: () => {
      return stderr;
    },
  }).then((message) => {
    return message as SetupResult;
  });
  void ready.catch(() => {});
  void result.catch(() => {});
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => {
      resolve();
    });
  });
  return { child, ready, result, closed };
}

function _getMessageFromSetupProcess(
  options: Readonly<{
    child: ChildProcess;
    kind: "ready" | "result";
    getStderr: () => string;
  }>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      options.child.off("message", onMessage);
      options.child.off("error", onError);
      options.child.off("exit", onExit);
    };
    const onMessage = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "kind" in message &&
        message.kind === options.kind
      ) {
        cleanup();
        resolve(message);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: string | null) => {
      onError(
        new Error(
          `Setup child exited (${code}, ${signal}): ${options.getStderr()}`,
        ),
      );
    };
    options.child.on("message", onMessage);
    options.child.once("error", onError);
    options.child.once("exit", onExit);
  });
}

async function _closeSetupProcess(processContext: SetupProcess): Promise<void> {
  await processContext.ready.catch(() => {});
  if (processContext.child.connected) {
    processContext.child.send("close", () => {});
  }
  await processContext.closed;
}

it("serializes competing first-admin requests on separate file-backed connections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-race-"));
  const databasePath = join(directory, "catalog.db");
  const database = createDatabase(databasePath);
  const processes: SetupProcess[] = [];
  try {
    await migrateToLatest(database);
    processes.push(
      _startSetupProcess(databasePath),
      _startSetupProcess(databasePath),
    );
    await Promise.all(
      processes.map((processContext) => {
        return processContext.ready;
      }),
    );
    processes.forEach((processContext) => {
      processContext.child.send("start");
    });
    const results = await Promise.all(
      processes.map((processContext) => {
        return processContext.result;
      }),
    );
    expect(
      results
        .map((result) => {
          return result.statusCode;
        })
        .sort(),
    ).toEqual([201, 409]);
    expect(
      results.find((result) => {
        return result.statusCode === 409;
      }),
    ).toMatchObject({
      error: "setup_already_completed",
      hasCookie: false,
    });
    expect(
      results.find((result) => {
        return result.statusCode === 201;
      })?.hasCookie,
    ).toBe(true);
    expect(
      await database.selectFrom("members").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("sessions").selectAll().execute(),
    ).toHaveLength(1);
  } finally {
    await Promise.all(processes.map(_closeSetupProcess));
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("rejects readiness after a child exits during catalog initialization", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-readiness-"));
  const databasePath = join(directory, "broken.db");
  await writeFile(databasePath, "invalid SQLite catalog");
  const processContext = _startSetupProcess(databasePath);
  try {
    await expect(processContext.ready).rejects.toThrow("Setup child exited");
    await expect(processContext.result).rejects.toThrow("Setup child exited");
  } finally {
    await _closeSetupProcess(processContext);
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("waits for readiness before shutting down an initializing child", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-early-close-"));
  const processContext = _startSetupProcess(join(directory, "catalog.db"));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const didClose = await Promise.race([
      _closeSetupProcess(processContext).then(() => {
        return true;
      }),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => {
          resolve(false);
        }, 2_000);
      }),
    ]);
    expect(didClose).toBe(true);
  } finally {
    clearTimeout(timeout);
    if (processContext.child.exitCode === null) {
      processContext.child.kill();
    }
    await processContext.closed;
    await rm(directory, { recursive: true, force: true });
  }
}, 5_000);
