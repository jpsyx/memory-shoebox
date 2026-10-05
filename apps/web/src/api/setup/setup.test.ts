import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSetup,
  completeSetup,
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "./setup";
import {
  adminMembersQueryOptions,
  inviteMember,
} from "@/api/adminMembers/adminMembers";
import { mailHealthQueryOptions } from "@/api/mailHealth/mailHealth";
import { CREATED_SESSION } from "@/surfaces/SignIn/SignInCard/__tests__/SignInCard.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
it("creates a normal bootstrap and completes with no response body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      return init?.method === "POST" && _path === "/api/setup/complete"
        ? new Response(null, { status: 204 })
        : Response.json(CREATED_SESSION, { status: 201 });
    }),
  );
  const body = {
    admin: { displayName: "Owner", email: "owner@example.com" },
    shoebox: { name: "My Shoebox", timezone: "UTC" },
    public: { baseUrl: "http://localhost:5173" },
  };
  expect(await createSetup(body)).toEqual(CREATED_SESSION);
  expect(fetch).toHaveBeenCalledWith(
    "/api/setup",
    expect.objectContaining({
      body: JSON.stringify(body),
      credentials: "same-origin",
    }),
  );
  await expect(completeSetup()).resolves.toBeUndefined();
});
it("status actually refreshes a cached catalog transition", async () => {
  const client = new QueryClient();
  client.setQueryData(setupStatusQueryOptions.queryKey, { isRequired: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({ isRequired: false });
    }),
  );
  expect(await client.fetchQuery(setupStatusQueryOptions)).toEqual({
    isRequired: false,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(setupProgressQueryOptions.staleTime).toBe(0);
});
it("keeps full administrative members separate from picker data and exposes real adapters", () => {
  expect(adminMembersQueryOptions.queryKey).not.toEqual(["members", "picker"]);
  expect(inviteMember).toBeTypeOf("function");
  expect(mailHealthQueryOptions.queryKey).toEqual(["mail-health"]);
});
