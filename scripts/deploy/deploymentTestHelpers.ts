import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import type { Command, Runner } from "./runCommand/runCommand";
const directories: string[] = [];
/** Complete production runtime values used only by fake deployment tests. */
export const SERVER = `SESSION_SECRET=${"x".repeat(40)}
B2_KEY_ID=private-id
B2_APPLICATION_KEY=private-key
B2_BUCKET=family-bucket
B2_ENDPOINT=https://s3.example.com
B2_REGION=region-one
RESEND_API_KEY=
NODE_ENV=production
ENABLE_FAKE_EMAIL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PORT=8080
HOST=0.0.0.0
DATABASE_PATH=/data/catalog.db
`;
/** Operator configuration fixture with a two-GB catalog minimum. */
export const DEPLOY = `FLY_APP=example-shoebox
FLY_REGION=iad
FLY_VOLUME_NAME=shoebox_data
FLY_VOLUME_SIZE_GB=2
FLY_MOUNT_PATH=/data
FLY_VM_SIZE=shared-cpu-1x
FLY_VM_MEMORY_MB=512
FLY_MIN_MACHINES_RUNNING=0
FLY_AUTO_STOP_MACHINES=suspend
FLY_CHECK_INTERVAL_SECONDS=30
FLY_CHECK_TIMEOUT_SECONDS=5
FLY_CHECK_GRACE_PERIOD_SECONDS=30
FLY_API_TOKEN=
`;
/** Healthy attached volume fixture matching the default test machine. */
export const VOLUME = {
  id: "vol_one",
  name: "shoebox_data",
  region: "iad",
  state: "created",
  size_gb: 2,
  attached_machine_id: "machine_one",
};
/** One catalog machine fixture in the supported process group. */
export const MACHINE = {
  id: "machine_one",
  region: "iad",
  state: "started",
  config: {
    metadata: { fly_process_group: "app" },
    mounts: [{ volume: "vol_one", path: "/data" }],
  },
};

/** Makes a temporary repository containing all required deployment inputs. */
export function createDeploymentFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "shoebox-deploy-test-"));
  directories.push(root);
  mkdirSync(join(root, "apps/server"), { recursive: true });
  mkdirSync(join(root, "apps/web"), { recursive: true });
  writeFileSync(join(root, "apps/server/.env.example"), SERVER);
  writeFileSync(join(root, "apps/web/.env.example"), "# No web keys\n");
  writeFileSync(join(root, ".env.deploy.example"), DEPLOY);
  writeFileSync(join(root, ".env.server.production"), SERVER);
  writeFileSync(join(root, ".env.web.production"), "# No web keys\n");
  writeFileSync(join(root, ".env.deploy"), DEPLOY);
  writeFileSync(join(root, "Dockerfile"), "FROM scratch\n");
  return root;
}

/** Emulates Fly CLI reads, staged writes and config-relative build lookup. */
export function makeRunnerFixtureFromOptions(
  options: {
    volumes?: unknown;
    machines?: unknown;
    fail?: string;
    secrets?: unknown;
    checks?: object;
  } = {},
): { runner: Runner; commands: Command[]; configs: string[] } {
  const commands: Command[] = [];
  const configs: string[] = [];
  const runner: Runner = async (command) => {
    commands.push(command);
    if (command.args[0] === "deploy") {
      const configPath = command.args[command.args.indexOf("--config") + 1]!;
      configs.push(configPath);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      // Fly resolves configured Dockerfiles relative to the config file,
      // while default discovery uses the supplied working directory.
      const dockerfile = config.build?.dockerfile
        ? join(dirname(configPath), config.build.dockerfile)
        : join(command.args[1]!, "Dockerfile");
      expect(existsSync(dockerfile)).toBe(true);
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        app: "example-shoebox",
        primary_region: "iad",
        mounts: [{ source: "shoebox_data", destination: "/data" }],
      });
      expect(config.http_service.checks[0]).toMatchObject(
        options.checks ?? {
          interval: "30s",
          timeout: "5s",
          grace_period: "30s",
        },
      );
      command.onOutput?.("Building image\nprivate-key\n");
    }
    if (command.args[0] === options.fail && command.args[1] !== "list") {
      throw new Error("private-key token=secret");
    }
    if (command.args[0] === "secrets" && command.args[1] === "list") {
      return JSON.stringify(options.secrets ?? []);
    }
    if (command.args[0] === "volumes") {
      return JSON.stringify(options.volumes ?? [VOLUME]);
    }
    if (command.args[0] === "machine") {
      return JSON.stringify(options.machines ?? [MACHINE]);
    }
    return "{}";
  };
  return { runner, commands, configs };
}

/** Removes only the temporary fixtures created by these tests. */
export function cleanupDeploymentFixtures(): void {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
}
