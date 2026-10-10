import { posix } from "node:path";
import { parseConfig } from "../../apps/server/src/configHelpers";
import type { Environment } from "./environmentHelpers/environmentHelpers";

/** Validates operator Fly choices before contacting the platform. */
function _getOperatorIssues(operator: Environment): string[] {
  const issues: string[] = [];
  Object.entries(operator)
    .filter(([name, value]) => {
      return name !== "FLY_API_TOKEN" && value.trim() === "";
    })
    .forEach(([name]) => {
      return issues.push(`${name}: must not be blank`);
    });
  ["FLY_APP", "FLY_VOLUME_NAME", "FLY_VM_SIZE"].forEach((name) => {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(operator[name] ?? "")) {
      issues.push(`${name}: invalid identifier`);
    }
  });
  if (!/^[a-z]{3}$/.test(operator.FLY_REGION ?? "")) {
    issues.push("FLY_REGION: use a three-letter region");
  }
  if (!/^[1-9]\d*$/.test(operator.FLY_VM_MEMORY_MB ?? "")) {
    issues.push("FLY_VM_MEMORY_MB: positive integer required");
  }
  if (!["0", "1"].includes(operator.FLY_MIN_MACHINES_RUNNING ?? "")) {
    issues.push("FLY_MIN_MACHINES_RUNNING: only 0 or 1 supported");
  }
  if (
    !["suspend", "stop", "off"].includes(operator.FLY_AUTO_STOP_MACHINES ?? "")
  ) {
    issues.push("FLY_AUTO_STOP_MACHINES: use suspend, stop or off");
  }
  return [...issues, ..._getNumericOperatorIssues(operator)];
}

/** Keeps the catalog strictly inside one persistent mount. */
function _getPathIssues(options: {
  server: Environment;
  operator: Environment;
}): string[] {
  const { server, operator } = options;
  const issues: string[] = [];
  const mount = operator.FLY_MOUNT_PATH ?? "";
  if (!_isCanonicalAbsolutePath(mount) || mount === "/") {
    issues.push(
      "FLY_MOUNT_PATH: use a canonical absolute directory other than root",
    );
  }
  const database = server.DATABASE_PATH ?? "";
  if (
    !_isCanonicalAbsolutePath(database) ||
    !database.startsWith(`${mount}/`)
  ) {
    issues.push(
      "DATABASE_PATH: must be an absolute file within FLY_MOUNT_PATH",
    );
  }
  return issues;
}

/** Keeps runtime validation aligned with the server without logging input. */
function _getServerIssues(server: Environment): string[] {
  const issues: string[] = [];
  try {
    parseConfig(server);
  } catch (error) {
    // Only names from the runtime validator cross this boundary.
    const names = String(error).matchAll(/- ([A-Z][A-Z0-9_]*):/g);
    Array.from(names).forEach((match) => {
      return issues.push(`${match[1]}: invalid or missing runtime value`);
    });
    if (issues.length === 0) {
      issues.push("Server configuration: invalid runtime values");
    }
  }
  return [
    ...issues,
    ..._getProductionRuntimeIssues(server),
    ..._getOptionalRuntimeIssues(server),
  ];
}

/** Production-only invariants on the otherwise shared server schema. */
function _getProductionRuntimeIssues(server: Environment): string[] {
  const issues: string[] = [];
  if (server.NODE_ENV !== "production") {
    issues.push("NODE_ENV: must be production");
  }
  if (server.HOST !== "0.0.0.0") {
    issues.push("HOST: must be 0.0.0.0");
  }
  if (
    !/^\d+$/.test(server.PORT ?? "") ||
    Number(server.PORT) < 1 ||
    Number(server.PORT) > 65535
  ) {
    issues.push("PORT: must be an integer from 1 to 65535");
  }
  if (server.ENABLE_FAKE_EMAIL === "true") {
    issues.push("ENABLE_FAKE_EMAIL: must be blank or disabled in production");
  }
  return issues;
}

/** Rejects half-configured integrations and required blank fields. */
function _getOptionalRuntimeIssues(server: Environment): string[] {
  const issues: string[] = [];
  if (
    Boolean(server.UPSTASH_REDIS_REST_URL) !==
    Boolean(server.UPSTASH_REDIS_REST_TOKEN)
  ) {
    issues.push(
      "UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: set both or leave both blank",
    );
  }
  if (
    server.UPSTASH_REDIS_REST_URL &&
    !URL.canParse(server.UPSTASH_REDIS_REST_URL)
  ) {
    issues.push("UPSTASH_REDIS_REST_URL: invalid URL");
  }
  Object.entries(server)
    .filter(([name, value]) => {
      return (
        value.trim() === "" &&
        ![
          "RESEND_API_KEY",
          "ENABLE_FAKE_EMAIL",
          "UPSTASH_REDIS_REST_URL",
          "UPSTASH_REDIS_REST_TOKEN",
        ].includes(name)
      );
    })
    .forEach(([name]) => {
      return issues.push(`${name}: must not be blank`);
    });
  return issues;
}

/** Rejects traversal and platform-specific path interpretations. */
function _isCanonicalAbsolutePath(path: string): boolean {
  return (
    posix.isAbsolute(path) &&
    !path.endsWith("/") &&
    posix.normalize(path) === path &&
    !path.includes("\\") &&
    !/[\r\n\0]/.test(path)
  );
}

/** Checks capacity and health timing inputs as finite whole numbers. */
function _getNumericOperatorIssues(operator: Environment): string[] {
  return [
    "FLY_VOLUME_SIZE_GB",
    "FLY_CHECK_INTERVAL_SECONDS",
    "FLY_CHECK_TIMEOUT_SECONDS",
    "FLY_CHECK_GRACE_PERIOD_SECONDS",
  ].flatMap((name) => {
    const value = operator[name] ?? "";
    const minimum = name === "FLY_CHECK_GRACE_PERIOD_SECONDS" ? 0 : 1;
    return /^\d+$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= minimum
      ? []
      : [`${name}: must be a whole number at least ${minimum}`];
  });
}

/** Names production configuration problems, never credential values. */
export function getProductionIssuesFromEnv(options: {
  server: Environment;
  web: Environment;
  operator: Environment;
}): string[] {
  const { server, web, operator } = options;
  const issues = _getServerIssues(server);
  Object.keys(web)
    .filter((name) => {
      return !name.startsWith("VITE_");
    })
    .forEach((name) => {
      return issues.push(`${name}: web keys must be public VITE_ values`);
    });
  Object.entries(web).forEach(([name, value]) => {
    if (value.trim() === "") {
      issues.push(`${name}: must not be blank`);
    }
  });
  issues.push(..._getOperatorIssues(operator), ..._getPathIssues(options));
  return issues;
}
