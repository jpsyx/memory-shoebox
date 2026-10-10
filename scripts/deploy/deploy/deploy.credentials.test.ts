import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { deploy } from "./deploy";
import { runCommand } from "../runCommand/runCommand";
import type { Command, Runner } from "../runCommand/runCommand";
import {
  cleanupDeploymentFixtures,
  createDeploymentFixture,
  makeRunnerFixtureFromOptions,
  DEPLOY,
} from "../deploymentTestHelpers";

afterEach(() => {
  vi.unstubAllEnvs();
  cleanupDeploymentFixtures();
});

/** Probes effective credentials without returning or logging their values. */
async function _getCredentialProbeFromCommand(
  command: Readonly<Command>,
): Promise<unknown> {
  return JSON.parse(
    await runCommand({
      ...command,
      executable: process.execPath,
      args: [
        "-e",
        `
      process.stdout.write(JSON.stringify({
        hasApiToken: Boolean(process.env.FLY_API_TOKEN),
        hasAccessToken: Boolean(process.env.FLY_ACCESS_TOKEN),
        usesFileToken: (process.env.FLY_ACCESS_TOKEN || process.env.FLY_API_TOKEN)
          === 'file-token-fixture',
      }));
    `,
      ],
      onOutput: undefined,
    }),
  );
}

/** Keeps orchestration fake while exercising real process environment merging. */
function _makeProbingRunnerFromRunner(
  options: Readonly<{
    runner: Runner;
    probes: unknown[];
    isConfigured: boolean;
  }>,
): Runner {
  return async (command) => {
    options.probes.push(await _getCredentialProbeFromCommand(command));
    if (options.isConfigured && command.args[0] === "deploy") {
      command.onOutput?.("file-token-fixture\n");
    }
    return options.runner(command);
  };
}

/** Checks the operator-facing channels for accidental credential disclosure. */
function _assertSafeCredentialOutput(
  options: Readonly<{
    commands: readonly Command[];
    output: readonly string[];
  }>,
): void {
  const argumentsText = options.commands
    .flatMap((command) => {
      return command.args;
    })
    .join(" ");
  expect(argumentsText).not.toMatch(
    /file-token-fixture|inherited-(api|access)-fixture/,
  );
  expect(options.output.join("")).not.toMatch(
    /file-token-fixture|inherited-(api|access)-fixture/,
  );
}

it.each(["configured", "blank"])(
  "uses only the %s file credential in real child processes",
  async (credential) => {
    vi.stubEnv("FLY_API_TOKEN", "inherited-api-fixture");
    vi.stubEnv("FLY_ACCESS_TOKEN", "inherited-access-fixture");
    const root = createDeploymentFixture();
    if (credential === "configured") {
      writeFileSync(
        join(root, ".env.deploy"),
        DEPLOY.replace("FLY_API_TOKEN=", "FLY_API_TOKEN=file-token-fixture"),
      );
    }
    const fake = makeRunnerFixtureFromOptions();
    const probes: unknown[] = [];
    const output: string[] = [];
    await deploy({
      root,
      runner: _makeProbingRunnerFromRunner({
        runner: fake.runner,
        probes,
        isConfigured: credential === "configured",
      }),
      log: (message) => {
        output.push(message);
      },
    });
    expect(probes.length).toBeGreaterThan(0);
    probes.forEach((probe) => {
      expect(probe).toEqual({
        hasApiToken: credential === "configured",
        hasAccessToken: false,
        usesFileToken: credential === "configured",
      });
    });
    _assertSafeCredentialOutput({ commands: fake.commands, output });
  },
);
