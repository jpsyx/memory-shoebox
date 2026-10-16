import type { Browser, Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "../../../apps/web/src/testing/createMeResponse.ts";
import type { Mock } from "vitest";
import type { SharedSessionState } from "../createSharedSessionStore/createSharedSessionStore.ts";

/** Operations observed by the mocked fixture driver and mocked assertions. */
type SessionPage = Pick<Page, "close"> & {
  goto: (url: string) => Promise<unknown>;
  getByLabel: (...args: Parameters<Page["getByLabel"]>) => object;
};

/** Context dependencies exercised by the real shared-session helper. */
type SessionContext = {
  newPage: () => Promise<SessionPage>;
  storageState: () => Promise<SharedSessionState["storageState"]>;
  request: {
    get: (url: string) => Promise<{
      status: () => number;
      json: () => Promise<unknown>;
    }>;
  };
  close: () => Promise<void>;
};

/** Browser dependency accepted by this test's captured fixture callbacks. */
type SessionBrowser = {
  newContext: (
    options?: Parameters<Browser["newContext"]>[0],
  ) => Promise<SessionContext>;
};

type SessionFixtures = Record<
  string,
  (
    args: { browser: SessionBrowser },
    provide: (page: SessionPage) => Promise<void>,
  ) => Promise<void>
>;

type SessionHarness = {
  browser: SessionBrowser;
  account: ReturnType<typeof createMeResponse>;
  accountRead: Mock<
    () => Promise<{
      status: () => number;
      json: () => Promise<ReturnType<typeof createMeResponse>>;
    }>
  >;
  status: { value: number };
};

const mocks = vi.hoisted(() => {
  const fixtures: SessionFixtures = {};
  return {
    fixtures,
    mint: vi.fn(),
    seed: vi.fn(async () => {
      return { memberId: "018f0000-0000-7000-8000-000000000000" };
    }),
    run: {
      directory: "",
      runId: "owned-run-one",
      baseUrl: "http://localhost:8099",
    },
  };
});

vi.mock("@playwright/test", () => {
  const test = {
    extend: (fixtures: typeof mocks.fixtures) => {
      Object.assign(mocks.fixtures, fixtures);
      return test;
    },
  };
  return {
    test,
    expect: () => {
      return { toHaveURL: async () => {}, toBeVisible: async () => {} };
    },
  };
});
vi.mock("../database.ts", () => {
  return { seedMemberAtAddress: mocks.seed };
});
vi.mock("../signInHelpers.ts", () => {
  return { signInAs: mocks.mint };
});
vi.mock("../e2eCatalogLifecycleHelpers.ts", () => {
  return {
    getSharedSessionStoreOptionsFromCatalogLock: () => {
      return mocks.run;
    },
  };
});

const ownedDirectories: string[] = [];
afterEach(() => {
  ownedDirectories.forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
  ownedDirectories.length = 0;
  vi.clearAllMocks();
});

function _makeHarness(): SessionHarness {
  mocks.run.directory = mkdtempSync(join(tmpdir(), "shoebox-session-worker-"));
  ownedDirectories.push(mocks.run.directory);
  const state: SharedSessionState["storageState"] = {
    cookies: [
      {
        name: "shoebox_session",
        value: "synthetic-test-cookie",
        domain: "localhost",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
  const account = createMeResponse({ email: "abuela@example.com" });
  const status = { value: 200 };
  const accountRead = vi.fn(async () => {
    return {
      status: () => {
        return status.value;
      },
      json: async () => {
        return account;
      },
    };
  });
  const browser: SessionBrowser = {
    newContext: vi.fn(async () => {
      return {
        newPage: async () => {
          return {
            goto: async () => {},
            close: async () => {},
            getByLabel: () => {
              return {};
            },
          };
        },
        storageState: async () => {
          return state;
        },
        request: { get: accountRead },
        close: async () => {},
      };
    }),
  };
  return { browser, account, accountRead, status };
}

async function _runWorker(browser: SessionBrowser): Promise<void> {
  vi.resetModules();
  await import("./signedIn.ts");
  await mocks.fixtures.adminPage!({ browser }, async () => {});
}

it("a replacement worker reuses the UI-minted session and validates its current account without reseeding", async () => {
  const { browser, accountRead } = _makeHarness();
  await _runWorker(browser);
  await _runWorker(browser);
  expect(mocks.mint).toHaveBeenCalledTimes(1);
  expect(mocks.seed).toHaveBeenCalledTimes(1);
  expect(accountRead).toHaveBeenCalledTimes(2);
});

it("three dedicated account contexts across workers reuse one UI sign-in and validate the same identity", async () => {
  const { browser, account, accountRead } = _makeHarness();
  account.me.email = "my-name@example.com";
  for (let caseIndex = 0; caseIndex < 3; caseIndex += 1) {
    vi.resetModules();
    await import("../../account/accountTestHelpers.ts");
    await mocks.fixtures.accountPage!({ browser }, async () => {});
  }
  expect(mocks.mint).toHaveBeenCalledTimes(1);
  expect(mocks.mint).toHaveBeenCalledWith(
    expect.objectContaining({ email: "my-name@example.com" }),
  );
  expect(mocks.seed).toHaveBeenCalledTimes(1);
  expect(accountRead).toHaveBeenCalledTimes(3);
  expect(browser.newContext).toHaveBeenCalledTimes(3);
});

it.each(["revoked", "role", "email", "member"])(
  "rejects a cached %s account without reseeding or reminting",
  async (kind) => {
    const { browser, account, status } = _makeHarness();
    await _runWorker(browser);
    if (kind === "revoked") {
      status.value = 401;
    }
    if (kind === "role") {
      account.me.role = "viewer";
    }
    if (kind === "email") {
      account.me.email = "changed@example.com";
    }
    if (kind === "member") {
      account.me.member.memberId = "018f0000-0000-7000-8000-000000000001";
    }
    await expect(_runWorker(browser)).rejects.toThrow(/refusing to/);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
    expect(mocks.seed).toHaveBeenCalledTimes(1);
  },
);
