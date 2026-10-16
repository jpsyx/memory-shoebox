import {
  type SharedSessionStoreOptions,
  createSharedSessionStore,
  type SharedSessionState,
} from "./createSharedSessionStore.ts";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
function _makeStore(): {
  options: SharedSessionStoreOptions;
  state: SharedSessionState;
  store: ReturnType<typeof createSharedSessionStore>;
} {
  const directory = mkdtempSync(join(tmpdir(), "shoebox-session-store-"));
  directories.push(directory);
  const options = {
    directory,
    runId: "owned-catalog-one",
    baseUrl: "http://localhost:8099",
  };
  const state: SharedSessionState = {
    email: "admin@example.com",
    role: "admin",
    memberId: "member-one",
    storageState: {
      cookies: [
        {
          name: "shoebox_session",
          value: "synthetic",
          domain: "localhost",
          path: "/",
          expires: Date.now() / 1000 + 3600,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  };
  return { options, state, store: createSharedSessionStore(options) };
}
afterEach(() => {
  directories.forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
  directories.length = 0;
});

it("publishes private complete state readable by an independent instance, keeping member roles separate", () => {
  const { options, state, store } = _makeStore();
  store.write(state);
  expect(
    createSharedSessionStore(options).read({
      email: state.email,
      role: state.role,
    }),
  ).toEqual(state);
  expect(store.read({ email: state.email, role: "viewer" })).toBeUndefined();
  const files = readdirSync(options.directory);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/\.json$/);
  expect(statSync(options.directory).mode & 0o777).toBe(0o700);
  expect(statSync(join(options.directory, files[0]!)).mode & 0o777).toBe(0o600);
});

it.each(["runId", "baseUrl"] as const)(
  "refuses another %s without replacing the original record",
  (field) => {
    const { options, state, store } = _makeStore();
    store.write(state);
    const other = createSharedSessionStore({
      ...options,
      [field]: "another-owned-run",
    });
    expect(() => {
      other.read({ email: state.email, role: state.role });
    }).toThrow(/identity/);
    expect(store.read({ email: state.email, role: state.role })).toEqual(state);
  },
);

it.each(["malformed", "expired", "identity", "missing-cookie", "origin"])(
  "fails closed for %s state, retaining failed evidence",
  (kind) => {
    const { options, state, store } = _makeStore();
    store.write(state);
    const path = join(options.directory, readdirSync(options.directory)[0]!);
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (kind === "expired") {
      record.storageState.cookies[0].expires = 1;
    }
    if (kind === "identity") {
      record.email = "somebody-else@example.com";
    }
    if (kind === "missing-cookie") {
      record.storageState.cookies = [];
    }
    if (kind === "origin") {
      record.storageState.cookies[0].domain = "other.invalid";
    }
    const contents = kind === "malformed" ? "{partial" : JSON.stringify(record);
    writeFileSync(path, contents);
    expect(() => {
      store.read({ email: state.email, role: state.role });
    }).toThrow(/refusing to mint/);
    expect(readFileSync(path, "utf8")).toBe(contents);
  },
);

it("never mistakes an interrupted unpublished write for a reusable entry", () => {
  const { options, state, store } = _makeStore();
  writeFileSync(join(options.directory, "interrupted.tmp"), "{partial", {
    mode: 0o600,
  });
  expect(store.read({ email: state.email, role: state.role })).toBeUndefined();
  store.write(state);
  expect(store.read({ email: state.email, role: state.role })).toEqual(state);
  expect(readFileSync(join(options.directory, "interrupted.tmp"), "utf8")).toBe(
    "{partial",
  );
});
