import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploy } from "./deploy";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupDeploymentFixtures,
  createDeploymentFixture,
  makeRunnerFixtureFromOptions,
  DEPLOY,
  VOLUME,
  MACHINE,
} from "../deploymentTestHelpers";
afterEach(cleanupDeploymentFixtures);
describe("single catalog deployment", () => {
  it("stages runtime secrets over stdin and deploys immediate with no HA", async () => {
    const fake = makeRunnerFixtureFromOptions();
    const output: string[] = [];
    await deploy({
      root: createDeploymentFixture(),
      runner: fake.runner,
      log: (message) => {
        return output.push(message);
      },
    });
    const secrets = fake.commands.find((command) => {
      return command.args[0] === "secrets" && command.args[1] === "import";
    })!;
    expect(secrets.args).toEqual([
      "secrets",
      "import",
      "--stage",
      "--app",
      "example-shoebox",
    ]);
    expect(secrets.stdin).toContain("B2_APPLICATION_KEY=");
    expect(
      fake.commands
        .flatMap((command) => {
          return command.args;
        })
        .join(" "),
    ).not.toContain("private-key");
    const deployment = fake.commands.find((command) => {
      return command.args[0] === "deploy";
    })!;
    expect(deployment.args).toContain("--ha=false");
    expect(deployment.args).toContain("immediate");
    expect(deployment.args).toContain("web_env=# No web keys\n");
    expect(
      deployment.args.some((argument) => {
        return argument.startsWith("WEB_ENV_DIGEST=");
      }),
    ).toBe(true);
    expect(output.join("\n")).toContain("Building image");
    expect(output.join("\n")).not.toContain("private-key");
    expect(output.join("\n")).toContain("✅");
    expect(
      fake.configs.every((path) => {
        return !existsSync(path);
      }),
    ).toBe(true);
  });

  it("stages removal of absent managed keys while preserving unrelated secrets", async () => {
    const fake = makeRunnerFixtureFromOptions({
      secrets: [
        { name: "B2_KEY_PREFIX", digest: "abc" },
        { name: "WEB_DIST_PATH", digest: "def" },
        { name: "OPERATOR_SECRET", digest: "ghi" },
      ],
    });
    await deploy({
      root: createDeploymentFixture(),
      runner: fake.runner,
      log: () => {},
    });
    const removal = fake.commands.find((command) => {
      return command.args[0] === "secrets" && command.args[1] === "unset";
    });
    expect(removal?.args).toEqual([
      "secrets",
      "unset",
      "B2_KEY_PREFIX",
      "WEB_DIST_PATH",
      "--stage",
      "--app",
      "example-shoebox",
    ]);
    expect(
      fake.commands.flatMap((command) => {
        return command.args;
      }),
    ).not.toContain("OPERATOR_SECRET");
  });

  it.each([
    { machines: [MACHINE, { ...MACHINE, id: "machine_two" }] },
    { volumes: [] },
    { volumes: [{ ...VOLUME, region: "lhr" }] },
    { machines: [{ ...MACHINE, region: "lhr" }] },
    {
      machines: [
        {
          ...MACHINE,
          config: {
            ...MACHINE.config,
            mounts: [{ volume: "vol_wrong", path: "/data" }],
          },
        },
      ],
    },
    {
      machines: [
        {
          ...MACHINE,
          config: {
            ...MACHINE.config,
            metadata: { fly_process_group: "worker" },
          },
        },
      ],
    },
    { volumes: [{ ...VOLUME, attached_machine_id: "machine_other" }] },
    { machines: { unexpected: [] } },
  ])(
    "refuses unsupported remote state before secret staging",
    async (state) => {
      const fake = makeRunnerFixtureFromOptions(state);
      await expect(
        deploy({
          root: createDeploymentFixture(),
          runner: fake.runner,
          log: () => {},
        }),
      ).rejects.toThrow();
      expect(
        fake.commands.some((command) => {
          return (
            command.args[0] === "deploy" ||
            (command.args[0] === "secrets" && command.args[1] !== "list")
          );
        }),
      ).toBe(false);
    },
  );

  it("uses nondefault operator health timings and accepts a larger volume", async () => {
    const root = createDeploymentFixture();
    writeFileSync(
      join(root, ".env.deploy"),
      DEPLOY.replace(
        "FLY_CHECK_INTERVAL_SECONDS=30",
        "FLY_CHECK_INTERVAL_SECONDS=45",
      )
        .replace("FLY_CHECK_TIMEOUT_SECONDS=5", "FLY_CHECK_TIMEOUT_SECONDS=8")
        .replace(
          "FLY_CHECK_GRACE_PERIOD_SECONDS=30",
          "FLY_CHECK_GRACE_PERIOD_SECONDS=0",
        ),
    );
    const fake = makeRunnerFixtureFromOptions({
      volumes: [{ ...VOLUME, size_gb: 8 }],
      checks: { interval: "45s", timeout: "8s", grace_period: "0s" },
    });
    await deploy({ root, runner: fake.runner, log: () => {} });
    expect(
      fake.commands.some((command) => {
        return command.args[0] === "deploy";
      }),
    ).toBe(true);
  });

  it("refuses a volume below the configured minimum before staging", async () => {
    const fake = makeRunnerFixtureFromOptions({
      volumes: [{ ...VOLUME, size_gb: 1 }],
    });
    await expect(
      deploy({
        root: createDeploymentFixture(),
        runner: fake.runner,
        log: () => {},
      }),
    ).rejects.toThrow(/FLY_VOLUME_SIZE_GB/);
    expect(
      fake.commands.some((command) => {
        return (
          command.args[0] === "deploy" ||
          (command.args[0] === "secrets" && command.args[1] !== "list")
        );
      }),
    ).toBe(false);
  });

  it("accepts a precreated unattached volume for first deploy", async () => {
    const fake = makeRunnerFixtureFromOptions({
      machines: [],
      volumes: [{ ...VOLUME, attached_machine_id: null }],
    });
    await deploy({
      root: createDeploymentFixture(),
      runner: fake.runner,
      log: () => {},
    });
    expect(
      fake.commands.some((command) => {
        return command.args[0] === "deploy";
      }),
    ).toBe(true);
  });

  it.each([undefined, "v1"])(
    "refuses platform metadata %s before secret staging or build",
    async (platformVersion) => {
      const fake = makeRunnerFixtureFromOptions({
        machines: [
          {
            ...MACHINE,
            config: {
              ...MACHINE.config,
              metadata: {
                ...MACHINE.config.metadata,
                fly_platform_version: platformVersion,
              },
            },
          },
        ],
      });
      await expect(
        deploy({
          root: createDeploymentFixture(),
          runner: fake.runner,
          log: () => {},
        }),
      ).rejects.toThrow(/managed v2/i);
      expect(
        fake.commands.some((command) => {
          return (
            command.args[0] === "deploy" ||
            (command.args[0] === "secrets" && command.args[1] !== "list")
          );
        }),
      ).toBe(false);
    },
  );

  it.each(["secrets", "deploy"])(
    "cleans temporary config and sanitizes %s failures",
    async (fail) => {
      const initialTemporary = readdirSync(tmpdir()).filter((name) => {
        return name.startsWith("memory-shoebox-deploy-");
      });
      const fake = makeRunnerFixtureFromOptions({ fail });
      const output: string[] = [];
      await expect(
        deploy({
          root: createDeploymentFixture(),
          runner: fake.runner,
          log: (message) => {
            return output.push(message);
          },
        }),
      ).rejects.toThrow(/failed/);
      expect(output.join("\n")).not.toContain("private-key");
      expect(
        readdirSync(tmpdir()).filter((name) => {
          return name.startsWith("memory-shoebox-deploy-");
        }),
      ).toEqual(initialTemporary);
      expect(
        fake.configs.every((path) => {
          return !existsSync(path);
        }),
      ).toBe(true);
    },
  );
});
