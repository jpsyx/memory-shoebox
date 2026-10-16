import { createMeResponse } from "@/testing/createMeResponse";

import {
  ADMIN,
  createCachedAdminQueryClient,
  MAIL,
} from "@/testing/setupNavigationTestHelpers";

import { expect, it } from "vitest";

import {
  bootstrap,
  installRootTestLifecycle,
  makeRootRouterFromOptions,
} from "./__rootTestHelpers";
installRootTestLifecycle();

it("actual navigation needs one authority request and preload needs no bootstrap", async () => {
  const requestPaths: string[] = [];
  const { router, client } = makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      requestPaths.push(path);
      return bootstrap();
    },
  });
  await router.load();
  expect(requestPaths).toEqual(["/api/bootstrap"]);
  expect(client.getQueryData(["me"])).toEqual(ADMIN);
  expect(client.getQueryData(["setup", "progress"])).toEqual({
    needsInvitations: false,
  });
  requestPaths.length = 0;
  await router.preloadRoute({
    to: "/items/$itemId",
    params: { itemId: "abc" },
  });
  expect(requestPaths).toEqual([]);
  await router.navigate({ to: "/items/$itemId", params: { itemId: "abc" } });
  expect(requestPaths).toEqual(["/api/bootstrap"]);
});

it("root read failure retains the attempted route until a successful retry", async () => {
  let failed = true;
  const { router } = makeRootRouterFromOptions({
    path: "/items/abc",
    answer: () => {
      return failed
        ? {
            body: { error: "unavailable", message: "Unavailable" },
            status: 503,
          }
        : {
            body: {
              setup: { isRequired: true },
              account: null,
              progress: null,
            },
          };
    },
  });
  await router.load();
  expect(router.state.matches[0]?.error).toMatchObject({ status: 503 });
  expect(router.state.location.pathname).toBe("/items/abc");
  failed = false;
  await router.invalidate();
  expect(router.state.location.pathname).toBe("/setup");
});

it("fresh setup replaces cached initialized status and private data", async () => {
  const client = createCachedAdminQueryClient();
  client.setQueryData(["setup", "status"], { isRequired: false });
  const { router } = makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return {
        body: { setup: { isRequired: true }, account: null, progress: null },
      };
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
});

it("initialized anonymous entry preserves its intended destination", async () => {
  const { router } = makeRootRouterFromOptions({
    path: "/items/abc?tag=family",
    answer: () => {
      return bootstrap({ account: null });
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(router.state.location.search).toEqual({
    redirect: "/items/abc?tag=family",
  });
});

it.each(["demotion", "revocation"])(
  "%s discards stale private authority without secondary reads",
  async (change) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["mail-health"], MAIL);
    client.setQueryData(["timeline"], { private: true });
    client.setQueryData(["setup", "progress"], { needsInvitations: true });
    const account =
      change === "demotion" ? createMeResponse({ role: "viewer" }) : null;
    const requestPaths: string[] = [];
    const { router } = makeRootRouterFromOptions({
      path: "/setup/invite",
      client,
      answer: ({ path }) => {
        requestPaths.push(path);
        return bootstrap({ account });
      },
    });
    await router.load();
    expect(router.state.location.pathname).toBe(
      change === "demotion" ? "/" : "/sign-in",
    );
    expect(client.getQueryData(["me"])).toEqual(account);
    [
      ["members", "admin"],
      ["mail-health"],
      ["me", "sessions"],
      ["timeline"],
      ["setup", "progress"],
    ].forEach((key) => {
      expect(client.getQueryData(key)).toBeUndefined();
    });
    expect(
      requestPaths.every((path) => {
        return path === "/api/bootstrap";
      }),
    ).toBe(true);
  },
);

it("pending invitation setup and completion races use the new bootstrap each navigation", async () => {
  let needsInvitations = true;
  const { router } = makeRootRouterFromOptions({
    path: "/people",
    answer: () => {
      return bootstrap({ account: ADMIN, needsInvitations });
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup/invite");
  needsInvitations = false;
  await router.navigate({ to: "/people" });
  expect(router.state.location.pathname).toBe("/people");
});

it("a setup redirect chain performs one fresh bootstrap for the actual navigation", async () => {
  const paths: string[] = [];
  const { router } = makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      paths.push(path);
      return {
        body: { setup: { isRequired: true }, account: null, progress: null },
      };
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
  expect(paths).toEqual(["/api/bootstrap"]);
});
