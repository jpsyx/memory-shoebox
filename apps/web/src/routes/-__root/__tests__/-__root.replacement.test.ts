import { meQueryOptions } from "@/api/me/me";

import { createMeResponse } from "@/testing/createMeResponse";

import {
  ADMIN,
  createCachedAdminQueryClient,
} from "@/testing/setupNavigationTestHelpers";

import { CancelledError } from "@tanstack/react-query";

import { expect, it, vi } from "vitest";

import {
  bootstrap,
  installRootTestLifecycle,
  makeRootRouterFromOptions,
} from "./__rootTestHelpers";
installRootTestLifecycle();

it.each([401, 403])(
  "authority refusal %s discards committed recovery and cached private data",
  async (status) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["settings-recovery"], { hasCommitted: true });
    client.setQueryData(["group-continuation"], { hasCommitted: true });
    const { router } = makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return { status, body: { error: "not_allowed", message: "Refused" } };
      },
    });
    await router.load();
    expect(router.state.matches[0]?.status).toBe("error");
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(client.getQueryData(["settings-recovery"])).toBeUndefined();
    expect(client.getQueryData(["group-continuation"])).toBeUndefined();
  },
);

it("account replacement discards the prior member's private data", async () => {
  const client = createCachedAdminQueryClient();
  const replacement = createMeResponse({
    memberId: "018f0000-0000-7000-8000-000000000099",
  });
  const { router } = makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return bootstrap({ account: replacement });
    },
  });
  await router.load();
  expect(client.getQueryData(["me"])).toEqual(replacement);
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
  expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
});

it("an unchanged account poll fences an overlapping bootstrap and leaves a fresh explicit retry", async () => {
  const client = createCachedAdminQueryClient();
  const { router } = makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return bootstrap();
    },
  });
  let releaseRead: (response: Response) => void = () => {};
  const staleRead = new Promise<Response>((settle) => {
    releaseRead = settle;
  });
  const paths: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input) => {
    const path = String(input);
    paths.push(path);
    return path === "/api/me"
      ? Response.json(ADMIN)
      : paths.length === 1
        ? staleRead
        : Response.json(bootstrap().body);
  });
  const loading = router.load();
  await vi.waitFor(() => {
    expect(paths).toEqual(["/api/bootstrap"]);
  });
  await client.fetchQuery({ ...meQueryOptions, staleTime: 0 });
  releaseRead(Response.json(bootstrap().body));
  await loading;
  expect(client.getQueryData(["me"])).toEqual(ADMIN);
  expect(router.state.matches[0]?.error).toBeInstanceOf(CancelledError);
  await router.invalidate();
  expect(router.state.matches[0]?.status).toBe("success");
  expect(paths).toEqual(["/api/bootstrap", "/api/me", "/api/bootstrap"]);
  client.clear();
});
