import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDeploymentFromRoot,
  makeEnvFromText,
  makeFlySecretsFromEnv,
} from "./environment";
import { deploy } from "./orchestration";
import type { Command, Runner } from "./process";

const directories: string[] = [];
const SERVER = `SESSION_SECRET=${"x".repeat(40)}
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
const DEPLOY = `FLY_APP=example-shoebox
FLY_REGION=iad
FLY_VOLUME_NAME=shoebox_data
FLY_MOUNT_PATH=/data
FLY_VM_SIZE=shared-cpu-1x
FLY_VM_MEMORY_MB=512
FLY_MIN_MACHINES_RUNNING=0
FLY_AUTO_STOP_MACHINES=suspend
FLY_API_TOKEN=
`;
const VOLUME = {
  id: "vol_one",
  name: "shoebox_data",
  region: "iad",
  state: "created",
  attached_machine_id: "machine_one",
};
const MACHINE = {
  id: "machine_one",
  region: "iad",
  state: "started",
  config: {
    metadata: { fly_process_group: "app" },
    mounts: [{ volume: "vol_one", path: "/data" }],
  },
};

function fixture(): string {
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

function runnerFixture(
  options: {
    volumes?: unknown;
    machines?: unknown;
    fail?: string;
    secrets?: unknown;
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

afterEach(() => {
  return directories.splice(0).forEach((directory) => {
    return rmSync(directory, { recursive: true, force: true });
  });
});

describe("production env preflight", () => {
  it("reports all missing files before executing any CLI", async () => {
    const root = fixture();
    [".env.server.production", ".env.web.production", ".env.deploy"].forEach(
      (name) => {
        return rmSync(join(root, name));
      },
    );
    const fake = runnerFixture();
    await expect(
      deploy({ root, runner: fake.runner, log: () => {} }),
    ).rejects.toThrow(
      /\.env.server.production.*\.env.web.production.*\.env.deploy/s,
    );
    expect(fake.commands).toEqual([]);
  });

  it("compares every active example key and accepts an empty web file", () => {
    const root = fixture();
    writeFileSync(
      join(root, "apps/server/.env.example"),
      `${SERVER}NEW_RUNTIME_KEY=\n# COMMENTED_KEY=\n`,
    );
    writeFileSync(
      join(root, ".env.server.production"),
      SERVER.replace("B2_BUCKET=family-bucket\n", "").replace(
        "B2_KEY_ID=private-id",
        "B2_KEY_ID=",
      ),
    );
    expect(() => {
      return getDeploymentFromRoot(root);
    }).toThrow(/B2_BUCKET.*NEW_RUNTIME_KEY.*B2_KEY_ID/s);
  });

  it.each([
    ["NODE_ENV=production", "NODE_ENV=development", "NODE_ENV"],
    ["HOST=0.0.0.0", "HOST=localhost", "HOST"],
    ["PORT=8080", "PORT=0", "PORT"],
    ["PORT=8080", "PORT=65536", "PORT"],
    [
      "DATABASE_PATH=/data/catalog.db",
      "DATABASE_PATH=/data-other/catalog.db",
      "DATABASE_PATH",
    ],
    [
      "DATABASE_PATH=/data/catalog.db",
      "DATABASE_PATH=/data/../catalog.db",
      "DATABASE_PATH",
    ],
    [
      "DATABASE_PATH=/data/catalog.db",
      "DATABASE_PATH=data/catalog.db",
      "DATABASE_PATH",
    ],
    [
      "DATABASE_PATH=/data/catalog.db",
      "DATABASE_PATH=/data/catalog/",
      "DATABASE_PATH",
    ],
    ["ENABLE_FAKE_EMAIL=", "ENABLE_FAKE_EMAIL=true", "ENABLE_FAKE_EMAIL"],
    [
      "UPSTASH_REDIS_REST_TOKEN=",
      "UPSTASH_REDIS_REST_TOKEN=private-token",
      "UPSTASH_REDIS_REST",
    ],
    [
      "B2_ENDPOINT=https://s3.example.com",
      "B2_ENDPOINT=private-invalid-url",
      "B2_ENDPOINT",
    ],
  ])(
    "rejects %s changed to invalid production config",
    (before, after, key) => {
      const root = fixture();
      writeFileSync(
        join(root, ".env.server.production"),
        SERVER.replace(before, after),
      );
      expect(() => {
        return getDeploymentFromRoot(root);
      }).toThrow(key);
      try {
        getDeploymentFromRoot(root);
      } catch (error) {
        expect(String(error)).not.toContain("private-invalid-url");
      }
    },
  );

  it("rejects ambiguous quote suffixes instead of silently losing value text", () => {
    expect(() => {
      return makeEnvFromText('TOKEN="first"private-suffix"');
    }).toThrow(/TOKEN/);
  });

  it("rejects blank active public web values", () => {
    const root = fixture();
    writeFileSync(join(root, "apps/web/.env.example"), "VITE_TITLE=\n");
    writeFileSync(join(root, ".env.web.production"), "VITE_TITLE=\n");
    expect(() => {
      return getDeploymentFromRoot(root);
    }).toThrow(/VITE_TITLE/);
  });

  it.each(["relative", "/", "/data/..", "/data/"])(
    "rejects invalid mount %s before any CLI",
    async (mount) => {
      const root = fixture();
      writeFileSync(
        join(root, ".env.deploy"),
        DEPLOY.replace("FLY_MOUNT_PATH=/data", `FLY_MOUNT_PATH=${mount}`),
      );
      const fake = runnerFixture();
      await expect(
        deploy({ root, runner: fake.runner, log: () => {} }),
      ).rejects.toThrow(/FLY_MOUNT_PATH/);
      expect(fake.commands).toEqual([]);
    },
  );

  it("preserves optional blanks and literal dollar/backslash/quote/hash values", () => {
    expect(
      makeEnvFromText("KEY='a $HOME $(touch nope) `id` \\ \" # = b'\nEMPTY=\n"),
    ).toEqual({ KEY: 'a $HOME $(touch nope) `id` \\ " # = b', EMPTY: "" });
    expect(getDeploymentFromRoot(fixture()).server.RESEND_API_KEY).toBe("");
  });

  it.each([
    "export TOKEN=private-token",
    "source private-token",
    'TOKEN="private-token',
    "TOKEN=x\nTOKEN=y",
    "TOKEN='private\ntoken'",
  ])("rejects malformed syntax with key-only errors", (input) => {
    expect(() => {
      return makeEnvFromText(input);
    }).toThrow();
    try {
      makeEnvFromText(input);
    } catch (error) {
      expect(String(error)).not.toContain("private-token");
    }
  });

  it.each([
    'a"b#c',
    'a""b#c',
    "a'b#c",
    'a"""b#c',
    "  back\\slash $value  ",
    '"leading"',
    "",
  ])("round-trips a secret through the authoritative Fly parser", (value) => {
    const serialized = makeFlySecretsFromEnv({ TOKEN: value });
    // Characterization of flyctl parser.go: hash removal precedes wrappers.
    let parsed = serialized
      .trimEnd()
      .split("=")
      .slice(1)
      .join("=")
      .replace(/^ +/, "");
    const hash = parsed.indexOf("#");
    if (
      hash >= 0 &&
      (parsed.slice(0, hash).match(/"/g)?.length ?? 0) % 2 === 0
    ) {
      parsed = parsed.slice(0, hash).replace(/ +$/, "");
    }
    if (parsed.startsWith('"""') && parsed.endsWith('"""')) {
      parsed = parsed.slice(3, -3);
    } else if (
      (parsed.startsWith('"') && parsed.endsWith('"')) ||
      (parsed.startsWith("'") && parsed.endsWith("'"))
    ) {
      parsed = parsed.slice(1, -1);
    }
    expect(parsed).toBe(value);
  });

  it("rejects multiline secrets before remote mutation", () => {
    expect(() => {
      return makeFlySecretsFromEnv({ TOKEN: "line\nline" });
    }).toThrow(/TOKEN/);
  });
});

describe("single catalog deployment", () => {
  it("stages runtime secrets over stdin and deploys immediate with no HA", async () => {
    const fake = runnerFixture();
    const output: string[] = [];
    await deploy({
      root: fixture(),
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
    const fake = runnerFixture({
      secrets: [
        { name: "B2_KEY_PREFIX", digest: "abc" },
        { name: "WEB_DIST_PATH", digest: "def" },
        { name: "OPERATOR_SECRET", digest: "ghi" },
      ],
    });
    await deploy({ root: fixture(), runner: fake.runner, log: () => {} });
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
      const fake = runnerFixture(state);
      await expect(
        deploy({ root: fixture(), runner: fake.runner, log: () => {} }),
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

  it("accepts a precreated unattached volume for first deploy", async () => {
    const fake = runnerFixture({
      machines: [],
      volumes: [{ ...VOLUME, attached_machine_id: null }],
    });
    await deploy({ root: fixture(), runner: fake.runner, log: () => {} });
    expect(
      fake.commands.some((command) => {
        return command.args[0] === "deploy";
      }),
    ).toBe(true);
  });

  it.each(["secrets", "deploy"])(
    "cleans temporary config and sanitizes %s failures",
    async (fail) => {
      const initialTemporary = readdirSync(tmpdir()).filter((name) => {
        return name.startsWith("memory-shoebox-deploy-");
      });
      const fake = runnerFixture({ fail });
      const output: string[] = [];
      await expect(
        deploy({
          root: fixture(),
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
