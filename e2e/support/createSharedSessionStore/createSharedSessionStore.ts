import type { BrowserContext } from "@playwright/test";
import { createHash, randomUUID as randomUuid } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SESSION_COOKIE_NAME } from "../../../apps/server/src/auth/sessionCookie.ts";
type SessionRecordOptions = {
  options: SharedSessionStoreOptions;
  value: unknown;
  email: string;
  role: SharedSessionState["role"];
};

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** An ephemeral store belongs to exactly one catalog generation and origin. */
export type SharedSessionStoreOptions = {
  directory: string;
  runId: string;
  baseUrl: string;
};

/**
 * Identity proved by real UI sign-in and a fresh authenticated account read.
 */
export type SharedSessionState = {
  email: string;
  role: "admin" | "viewer";
  memberId: string;
  storageState: StorageState;
};

function _isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function _isNameValue(value: unknown): boolean {
  return (
    _isObject(value) &&
    typeof value.name === "string" &&
    typeof value.value === "string"
  );
}

function _isStorageState(value: unknown): value is StorageState {
  if (
    !_isObject(value) ||
    !Array.isArray(value.cookies) ||
    !Array.isArray(value.origins)
  ) {
    return false;
  }
  return (
    value.cookies.every((cookie: unknown) => {
      return (
        _isObject(cookie) &&
        _isNameValue(cookie) &&
        typeof cookie.domain === "string" &&
        typeof cookie.path === "string" &&
        typeof cookie.expires === "number" &&
        Number.isFinite(cookie.expires) &&
        typeof cookie.httpOnly === "boolean" &&
        typeof cookie.secure === "boolean" &&
        ["Strict", "Lax", "None"].includes(String(cookie.sameSite))
      );
    }) &&
    value.origins.every((origin: unknown) => {
      return (
        _isObject(origin) &&
        typeof origin.origin === "string" &&
        Array.isArray(origin.localStorage) &&
        origin.localStorage.every(_isNameValue)
      );
    })
  );
}

function _getStateFromRecord({
  options,
  value,
  email,
  role,
}: SessionRecordOptions): SharedSessionState {
  if (
    !_isObject(value) ||
    value.runId !== options.runId ||
    value.baseUrl !== options.baseUrl ||
    value.email !== email ||
    value.role !== role ||
    typeof value.memberId !== "string" ||
    !value.memberId ||
    !_isStorageState(value.storageState)
  ) {
    throw new Error(
      "Shared E2E session identity or storage state is invalid; refusing to mint a replacement.",
    );
  }
  const cookies = value.storageState.cookies.filter((cookie) => {
    return cookie.name === SESSION_COOKIE_NAME;
  });
  if (
    cookies.length !== 1 ||
    !cookies[0]!.value ||
    cookies[0]!.domain !== new URL(options.baseUrl).hostname ||
    cookies[0]!.path !== "/" ||
    (cookies[0]!.expires !== -1 && cookies[0]!.expires <= Date.now() / 1000)
  ) {
    throw new Error(
      "Shared E2E session cookie is missing, mismatched or expired; refusing to mint a replacement.",
    );
  }
  return {
    email,
    role,
    memberId: value.memberId,
    storageState: value.storageState,
  };
}

/**
 * Private atomic persistence; only an absent entry is a legitimate first
 * sign-in.
 */
export function createSharedSessionStore(
  options: Readonly<SharedSessionStoreOptions>,
): {
  read: ({
    email,
    role,
  }: Readonly<{ email: string; role: SharedSessionState["role"] }>) =>
    | SharedSessionState
    | undefined;
  write: (state: SharedSessionState) => void;
} {
  const getPath = ({
    email,
    role,
  }: {
    email: string;
    role: SharedSessionState["role"];
  }): string => {
    return join(
      options.directory,
      `${createHash("sha256").update(`${email}:${role}`).digest("hex")}.json`,
    );
  };
  return {
    read: ({ email, role }) => {
      const contents = (() => {
        try {
          return readFileSync(getPath({ email, role }), "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return undefined;
          }
          throw error;
        }
      })();
      if (contents === undefined) {
        return undefined;
      }
      const value: unknown = (() => {
        try {
          return JSON.parse(contents);
        } catch {
          throw new Error(
            "Shared E2E session file is malformed; refusing to mint a replacement.",
          );
        }
      })();
      return _getStateFromRecord({ options, value, email, role });
    },
    write: (state) => {
      const record = {
        ...state,
        runId: options.runId,
        baseUrl: options.baseUrl,
      };
      _getStateFromRecord({
        options,
        value: record,
        email: state.email,
        role: state.role,
      });
      mkdirSync(options.directory, { recursive: true, mode: 0o700 });
      chmodSync(options.directory, 0o700);
      const temporaryPath = join(options.directory, `${randomUuid()}.tmp`);
      try {
        writeFileSync(temporaryPath, JSON.stringify(record), {
          flag: "wx",
          mode: 0o600,
        });
        renameSync(
          temporaryPath,
          getPath({ email: state.email, role: state.role }),
        );
      } finally {
        rmSync(temporaryPath, { force: true });
      }
    },
  };
}
