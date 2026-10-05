import { beforeEach, expect, it, vi } from "vitest";
import { runSetupCatalog } from "../../../../e2e/setup/runSetupCatalog.ts";

const resources = vi.hoisted(() => {
  const calls: string[] = [];
  const failure = new Error("owned resource failure");
  const closeProxy = vi.fn(async () => {
    calls.push("proxy");
  });
  const closeAssertions = vi.fn(() => {
    calls.push("assertions");
  });
  const closeApp = vi.fn(async () => {
    calls.push("app");
  });
  const destroyDatabase = vi.fn(async () => {
    calls.push("database");
  });
  return {
    calls,
    failure,
    closeProxy,
    closeAssertions,
    closeApp,
    destroyDatabase,
    createApp: vi.fn(),
    openAssertions: vi.fn(),
    createProxy: vi.fn(),
    removeDirectory: vi.fn(async () => {
      calls.push("directory");
    }),
  };
});
vi.mock("node:fs/promises", () => {
  return {
    mkdtemp: async () => {
      return "/test-owned/setup";
    },
    rm: resources.removeDirectory,
  };
});
vi.mock("../../src/db/client.ts", () => {
  return {
    createDatabase: () => {
      return { destroy: resources.destroyDatabase };
    },
  };
});
vi.mock("../helpers/createTestApp.ts", () => {
  return {
    createTestApp: resources.createApp,
  };
});
vi.mock("../../../../e2e/setup/makeSetupAssertionsFromPath.ts", () => {
  return {
    makeSetupAssertionsFromPath: resources.openAssertions,
  };
});
vi.mock("../../../../e2e/setup/createSetupHttpsProxy.ts", () => {
  return {
    createSetupHttpsProxy: resources.createProxy,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  resources.calls.length = 0;
  resources.createApp.mockResolvedValue({
    app: {
      listen: async () => {
        return "http://127.0.0.1:1234";
      },
      close: resources.closeApp,
    },
    b2: { calls: [] },
    close: async () => {
      await resources.closeApp();
      await resources.destroyDatabase();
    },
  });
  resources.openAssertions.mockReturnValue({
    members: () => {
      return [];
    },
    close: resources.closeAssertions,
  });
  resources.createProxy.mockResolvedValue({
    origin: "https://127.0.0.1:1235",
    close: resources.closeProxy,
  });
});

it("destroys the caller-owned database and directory if application initialization rejects", async () => {
  resources.createApp.mockRejectedValueOnce(resources.failure);
  await expect(runSetupCatalog(async () => {})).rejects.toBe(resources.failure);
  expect(resources.calls).toEqual(["database", "directory"]);
});
it("closes acquired application and database when opening read-only assertions fails", async () => {
  resources.openAssertions.mockImplementationOnce(() => {
    throw resources.failure;
  });
  await expect(runSetupCatalog(async () => {})).rejects.toBe(resources.failure);
  expect(resources.calls).toEqual(["app", "database", "directory"]);
});
it.each(["proxy", "assertions", "app", "database"] as const)(
  "attempts every later closure after %s teardown fails",
  async (resource) => {
    const failingClose = {
      proxy: resources.closeProxy,
      assertions: resources.closeAssertions,
      app: resources.closeApp,
      database: resources.destroyDatabase,
    }[resource];
    failingClose.mockImplementationOnce(() => {
      resources.calls.push(resource);
      throw resources.failure;
    });
    await expect(runSetupCatalog(async () => {})).rejects.toBe(
      resources.failure,
    );
    expect(resources.calls).toEqual([
      "proxy",
      "assertions",
      "app",
      "database",
      "directory",
    ]);
  },
);
it("closes all acquired resources if HTTPS initialization rejects", async () => {
  resources.createProxy.mockRejectedValueOnce(resources.failure);
  await expect(runSetupCatalog(async () => {})).rejects.toBe(resources.failure);
  expect(resources.calls).toEqual([
    "assertions",
    "app",
    "database",
    "directory",
  ]);
});
it("closes all owned resources after the browser callback fails", async () => {
  await expect(
    runSetupCatalog(async () => {
      throw resources.failure;
    }),
  ).rejects.toBe(resources.failure);
  expect(resources.calls).toEqual([
    "proxy",
    "assertions",
    "app",
    "database",
    "directory",
  ]);
});
