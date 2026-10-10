import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { getKeyBlocksFromEnv } from "../env/mergeEnvExample";
import { getProductionIssuesFromEnv } from "./validation";

/** Literal environment values, never expanded or evaluated by a shell. */
export type Environment = Readonly<Record<string, string>>;
/** Validated operator-owned deployment inputs. */
export type Deployment = {
  server: Environment;
  web: Environment;
  operator: Environment;
  webContents: string;
  secrets: string;
};

/** Reads single-line dotenv syntax as data, preserving literal escapes. */
export function makeEnvFromText(contents: string): Environment {
  const names = new Set<string>();
  contents.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(#|$)/.test(line)) {
      return;
    }
    const assignment = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const name = assignment?.[1];
    if (!name || names.has(name)) {
      throw new Error(`Invalid env syntax: ${name ?? `line ${index + 1}`}`);
    }
    names.add(name);
    const value = assignment[2] ?? "";
    if (/^["']/.test(value) && !_isSingleLineQuotedValue(value)) {
      throw new Error(`${name}: use a single-line quoted value`);
    }
    if (value.includes("\0")) {
      throw new Error(`${name}: unsupported control character`);
    }
  });
  return Object.fromEntries(
    Object.entries(parseEnv(contents)).filter(
      (entry): entry is [string, string] => {
        return entry[1] !== undefined;
      },
    ),
  );
}

/** Serializes exact single-line values for flyctl's non-dotenv parser. */
export function makeFlySecretsFromEnv(environment: Environment): string {
  return Object.entries(environment)
    .map(([name, value]) => {
      if (/[\r\n\0]/.test(value)) {
        throw new Error(
          `${name}: multiline/control characters are unsupported`,
        );
      }
      // Fly strips # before removing wrappers, counting double quotes first.
      // See flyctl/internal/command/secrets/parser.go. Escapes are literal.
      const beforeHash = value.split("#")[0] ?? "";
      const numQuotes = beforeHash.match(/"/g)?.length ?? 0;
      const wrapper = value.includes("#") && numQuotes % 2 === 1 ? "'" : '"""';
      const line = `${name}=${wrapper}${value}${wrapper}\n`;
      if (Buffer.byteLength(line) >= 65536) {
        throw new Error(`${name}: value exceeds Fly secret import line limit`);
      }
      return line;
    })
    .join("");
}

/** Loads all three files and checks current examples before remote actions. */
export function getDeploymentFromRoot(root: string): Deployment {
  const targets = [
    { name: ".env.server.production", example: "apps/server/.env.example" },
    { name: ".env.web.production", example: "apps/web/.env.example" },
    { name: ".env.deploy", example: ".env.deploy.example" },
  ];
  const missing = targets.filter((target) => {
    return !existsSync(join(root, target.name));
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing files: ${missing
        .map((target) => {
          return target.name;
        })
        .join(", ")}`,
    );
  }
  const loaded = targets.map((target) => {
    return _getEnvFromTarget({ root, ...target });
  });
  const [serverFile, webFile, operatorFile] = loaded;
  if (!serverFile || !webFile || !operatorFile) {
    throw new Error("Missing deployment inputs");
  }
  const issues = loaded.flatMap((target) => {
    return target.issues;
  });
  issues.push(
    ...getProductionIssuesFromEnv({
      server: serverFile.env,
      web: webFile.env,
      operator: operatorFile.env,
    }),
  );
  if (issues.length > 0) {
    throw new Error(`Invalid production configuration:\n${issues.join("\n")}`);
  }
  return {
    server: serverFile.env,
    web: webFile.env,
    operator: operatorFile.env,
    webContents: webFile.contents,
    secrets: makeFlySecretsFromEnv(serverFile.env),
  };
}

/** Reads a target and names missing active keys without revealing values. */
function _getEnvFromTarget(options: {
  root: string;
  name: string;
  example: string;
}): { env: Environment; contents: string; issues: string[] } {
  const contents = readFileSync(join(options.root, options.name), "utf8");
  const env = makeEnvFromText(contents);
  const example = readFileSync(join(options.root, options.example), "utf8");
  const issues = getKeyBlocksFromEnv(example)
    .filter((block) => {
      return !Object.hasOwn(env, block.name);
    })
    .map((block) => {
      return `${options.name}: missing ${block.name}`;
    });
  return { env, contents, issues };
}

/** Mirrors Node dotenv quote boundaries, refusing discarded suffix text. */
function _isSingleLineQuotedValue(value: string): boolean {
  const closingQuote = value.indexOf(value[0]!, 1);
  return (
    closingQuote > 0 && /^\s*(?:#.*)?$/.test(value.slice(closingQuote + 1))
  );
}
