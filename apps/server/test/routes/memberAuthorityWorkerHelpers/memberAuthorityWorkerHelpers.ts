import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { NOW } from "../../helpers/seedHelpers/seedHelpers.ts";

type WorkerOptions = {
  databasePath: string;
  memberId: string;
  sessionId: string;
  action: string;
};
type AuthorityWorker = {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  result: Promise<string>;
  exited: Promise<void>;
};

type WorkerOutput = { output: string; errors: string; isReady: boolean };

function _makeWorkerScriptFromOptions(options: WorkerOptions): string {
  const { databasePath, memberId, sessionId, action } = options;
  const moduleUrl = new URL(
    `../../../src/administration/${action}.ts`,
    import.meta.url,
  ).href;
  const clientUrl = new URL("../../../src/db/client.ts", import.meta.url).href;
  return `import { createDatabase } from ${JSON.stringify(clientUrl)};
    const database = createDatabase(${JSON.stringify(databasePath)});
    console.log("ready");
    process.stdin.once("data", async () => {
      try {
        const module = await import(${JSON.stringify(moduleUrl)});
        await module[${JSON.stringify(action)}]({ database, viewer: { memberId: ${JSON.stringify(memberId)}, sessionId: ${JSON.stringify(sessionId)}, role: "admin", isAdmin: true, visibleRuleIds: [] }, memberId: ${JSON.stringify(memberId)}, role: "viewer", now: ${JSON.stringify(NOW)} });
        console.log("ok");
      } catch(error) { console.log(error.code ?? error.message); }
      await database.destroy();
    });`;
}

function _getCompletionFromChild(options: {
  child: ChildProcessWithoutNullStreams;
  state: WorkerOutput;
  ready: PromiseWithResolvers<void>;
}): Pick<AuthorityWorker, "result" | "exited"> {
  const { child, state, ready } = options;
  const result = Promise.withResolvers<string>();
  const exited = Promise.withResolvers<void>();
  child.once("error", result.reject);
  child.once("close", (code, signal) => {
    const error = new Error(
      state.errors ||
        `Authority worker exited ${code ?? signal} before completion`,
    );
    if (!state.isReady) {
      ready.reject(error);
    }
    if (code !== 0 || !state.isReady) {
      result.reject(error);
    } else {
      result.resolve(state.output.trim().split("\n").at(-1) ?? "");
    }
    exited.resolve();
  });
  void result.promise.catch(() => {});
  return { result: result.promise, exited: exited.promise };
}

function _watchWorker(child: ChildProcessWithoutNullStreams): AuthorityWorker {
  const ready = Promise.withResolvers<void>();
  const state: WorkerOutput = { output: "", errors: "", isReady: false };
  child.stdout.on("data", (chunk) => {
    state.output += String(chunk);
    if (state.output.includes("ready\n")) {
      state.isReady = true;
      ready.resolve();
    }
  });
  child.stderr.on("data", (chunk) => {
    state.errors += String(chunk);
  });
  child.once("error", ready.reject);
  // Observe failures immediately even when the caller awaits readiness first.
  void ready.promise.catch(() => {});
  return {
    child,
    ready: ready.promise,
    ..._getCompletionFromChild({ child, state, ready }),
  };
}

/** Start a separate process for one last-admin authority mutation. */
export function startMemberAuthorityWorker(
  options: WorkerOptions,
): AuthorityWorker {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", _makeWorkerScriptFromOptions(options)],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  return _watchWorker(child);
}

/** Await every owned child exit before the shared catalog can be removed. */
export async function stopMemberAuthorityWorkers(
  workers: AuthorityWorker[],
): Promise<void> {
  workers.forEach((worker) => {
    if (worker.child.exitCode === null && worker.child.signalCode === null) {
      worker.child.kill();
    }
  });
  await Promise.all(
    workers.map((worker) => {
      return worker.exited;
    }),
  );
  await Promise.allSettled(
    workers.map((worker) => {
      return worker.result;
    }),
  );
}
