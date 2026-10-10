import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDeploymentFromRoot } from "./environment";
import type { Deployment, Environment } from "./environment";
import { makeFlyConfigFromDeployment } from "./configuration";
import { runCommand } from "./process";
import type { Runner } from "./process";
import { getStaleSecretNamesFromRemote } from "./secrets";
import { validateRemoteLayout } from "./remote";

/** Deployment options, allowing offline CLI verification. */
export type DeployOptions = {
  root: string;
  runner?: Runner;
  log?: (message: string) => void;
};
/** One Fly invocation bound to the selected app and repository. */
type FlyCommand = (
  args: readonly string[],
  stdin?: string,
  onOutput?: (text: string) => void,
) => Promise<string>;

/** Validates before staging secrets and replacing the single machine. */
export async function deploy(options: DeployOptions): Promise<void> {
  const log =
    options.log ??
    ((message) => {
      process.stdout.write(message);
    });
  _reportPhase({ log, phase: "🔎 Preflight" });
  const deployment = getDeploymentFromRoot(options.root);
  const temporary = mkdtempSync(join(tmpdir(), "memory-shoebox-deploy-"));
  const configPath = join(temporary, "fly.json");
  const command = _makeFlyCommandFromOptions({
    options,
    operator: deployment.operator,
  });
  let phase = "Fly validation";
  try {
    writeFileSync(
      configPath,
      JSON.stringify(makeFlyConfigFromDeployment(deployment)),
      { mode: 0o600 },
    );
    _reportPhase({ log, phase: "☁️ Fly validation" });
    const staleKeys = await _validateFly({ deployment, command });
    phase = "Secret staging";
    _reportPhase({ log, phase: "🔐 Secret staging" });
    await _stageSecrets({ deployment, command, staleKeys });
    phase = "Build/deploy";
    _reportPhase({ log, phase: "🚀 Build/deploy" });
    await command(
      _getDeployArgs({ root: options.root, deployment, configPath }),
      undefined,
      (text) => {
        log(_getRedactedOutput({ text, deployment }));
      },
    );
    log("\u001b[32m✅ Deployment complete\u001b[0m\n");
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unexpected deployment failure";
    const message = `${phase} failed: ${reason}. See docs/deployment.md for retry/recovery.`;
    log(`\u001b[31m❌ ${message}\u001b[0m\n`);
    throw new Error(message);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Binds credentials through environment, never CLI arguments. */
function _makeFlyCommandFromOptions(options: {
  options: DeployOptions;
  operator: Environment;
}): FlyCommand {
  const runner = options.options.runner ?? runCommand;
  return (args, stdin, onOutput) => {
    return runner({
      executable: "fly",
      args,
      cwd: options.options.root,
      env: { FLY_API_TOKEN: options.operator.FLY_API_TOKEN || undefined },
      stdin,
      onOutput,
    }).catch(() => {
      throw new Error(
        "Fly command failed; verify flyctl installation, authentication and app access",
      );
    });
  };
}

/** All reads finish before the first staged remote write. */
async function _validateFly(options: {
  deployment: Deployment;
  command: FlyCommand;
}): Promise<string[]> {
  const { command, deployment } = options;
  const app = deployment.operator.FLY_APP!;
  await command(["version"]);
  await command(["status", "--app", app, "--json"]);
  const volumesJson = await command([
    "volumes",
    "list",
    "--app",
    app,
    "--json",
  ]);
  const machinesJson = await command([
    "machine",
    "list",
    "--app",
    app,
    "--json",
  ]);
  validateRemoteLayout({
    operator: deployment.operator,
    volumesJson,
    machinesJson,
  });
  const secretsJson = await command([
    "secrets",
    "list",
    "--app",
    app,
    "--json",
  ]);
  return getStaleSecretNamesFromRemote({
    server: deployment.server,
    secretsJson,
  });
}

/** Staging changes never restart code against the old catalog schema. */
async function _stageSecrets(options: {
  deployment: Deployment;
  command: FlyCommand;
  staleKeys: string[];
}): Promise<void> {
  const { command, deployment, staleKeys } = options;
  const app = deployment.operator.FLY_APP!;
  if (staleKeys.length > 0) {
    await command(["secrets", "unset", ...staleKeys, "--stage", "--app", app]);
  }
  await command(
    ["secrets", "import", "--stage", "--app", app],
    deployment.secrets,
  );
}

/** Public web configuration reaches only the BuildKit secret mount. */
function _getDeployArgs(options: {
  root: string;
  deployment: Deployment;
  configPath: string;
}): string[] {
  const digest = createHash("sha256")
    .update(options.deployment.webContents)
    .digest("hex");
  return [
    "deploy",
    options.root,
    "--app",
    options.deployment.operator.FLY_APP!,
    "--config",
    options.configPath,
    "--ha=false",
    "--strategy",
    "immediate",
    "--yes",
    "--build-secret",
    `web_env=${options.deployment.webContents}`,
    "--build-arg",
    `WEB_ENV_DIGEST=${digest}`,
  ];
}

/** Redacts full values after line buffering, including split process chunks. */
function _getRedactedOutput(options: {
  text: string;
  deployment: Deployment;
}): string {
  const redactions = [
    ...Object.values(options.deployment.server),
    options.deployment.operator.FLY_API_TOKEN ?? "",
  ]
    .filter(Boolean)
    .sort((left, right) => {
      return right.length - left.length;
    });
  return redactions.reduce((output, secret) => {
    return output.replaceAll(secret, "[redacted]");
  }, options.text);
}

/** Prints a colored, recognizable phase without operator values. */
function _reportPhase(options: {
  log: (message: string) => void;
  phase: string;
}): void {
  options.log(`\u001b[36m${options.phase}\u001b[0m\n`);
}
