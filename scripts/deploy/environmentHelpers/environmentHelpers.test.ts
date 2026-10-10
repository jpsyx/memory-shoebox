import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getDeploymentFromRoot,
  makeEnvFromText,
  makeFlySecretsFromEnv,
} from "./environmentHelpers";
import { deploy } from "../deploy/deploy";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupDeploymentFixtures,
  createDeploymentFixture,
  makeRunnerFixtureFromOptions,
  SERVER,
  DEPLOY,
} from "../deploymentTestHelpers";
afterEach(cleanupDeploymentFixtures);
describe("production env preflight", () => {
  it("reports all missing files before executing any CLI", async () => {
    const root = createDeploymentFixture();
    [".env.server.production", ".env.web.production", ".env.deploy"].forEach(
      (name) => {
        return rmSync(join(root, name));
      },
    );
    const fake = makeRunnerFixtureFromOptions();
    await expect(
      deploy({ root, runner: fake.runner, log: () => {} }),
    ).rejects.toThrow(
      /\.env.server.production.*\.env.web.production.*\.env.deploy/s,
    );
    expect(fake.commands).toEqual([]);
  });

  it("compares every active example key and accepts an empty web file", () => {
    const root = createDeploymentFixture();
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
      const root = createDeploymentFixture();
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
    const root = createDeploymentFixture();
    writeFileSync(join(root, "apps/web/.env.example"), "VITE_TITLE=\n");
    writeFileSync(join(root, ".env.web.production"), "VITE_TITLE=\n");
    expect(() => {
      return getDeploymentFromRoot(root);
    }).toThrow(/VITE_TITLE/);
  });

  it.each(["relative", "/", "/data/..", "/data/"])(
    "rejects invalid mount %s before any CLI",
    async (mount) => {
      const root = createDeploymentFixture();
      writeFileSync(
        join(root, ".env.deploy"),
        DEPLOY.replace("FLY_MOUNT_PATH=/data", `FLY_MOUNT_PATH=${mount}`),
      );
      const fake = makeRunnerFixtureFromOptions();
      await expect(
        deploy({ root, runner: fake.runner, log: () => {} }),
      ).rejects.toThrow(/FLY_MOUNT_PATH/);
      expect(fake.commands).toEqual([]);
    },
  );

  it.each([
    ["FLY_VOLUME_SIZE_GB", "0"],
    ["FLY_VOLUME_SIZE_GB", "1.5"],
    ["FLY_CHECK_INTERVAL_SECONDS", "0"],
    ["FLY_CHECK_INTERVAL_SECONDS", "30s"],
    ["FLY_CHECK_TIMEOUT_SECONDS", "-1"],
    ["FLY_CHECK_GRACE_PERIOD_SECONDS", "-1"],
    ["FLY_CHECK_TIMEOUT_SECONDS", "9999999999999999999999999"],
  ])("rejects invalid %s before executing any CLI", async (name, value) => {
    const root = createDeploymentFixture();
    const existing = DEPLOY.replace(
      new RegExp(`${name}=[^\\n]*`),
      `${name}=${value}`,
    );
    writeFileSync(join(root, ".env.deploy"), existing);
    const fake = makeRunnerFixtureFromOptions();
    await expect(
      deploy({ root, runner: fake.runner, log: () => {} }),
    ).rejects.toThrow(name);
    expect(fake.commands).toEqual([]);
  });

  it("preserves optional blanks and literal dollar/backslash/quote/hash values", () => {
    expect(
      makeEnvFromText("KEY='a $HOME $(touch nope) `id` \\ \" # = b'\nEMPTY=\n"),
    ).toEqual({ KEY: 'a $HOME $(touch nope) `id` \\ " # = b', EMPTY: "" });
    expect(
      getDeploymentFromRoot(createDeploymentFixture()).server.RESEND_API_KEY,
    ).toBe("");
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
