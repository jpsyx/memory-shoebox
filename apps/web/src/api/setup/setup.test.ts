import type { ListMembersResponse } from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSetup,
  completeSetup,
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "./setup";
import { adminMembersQueryOptions } from "@/api/adminMembers/adminMembers";
import { membersQueryOptions } from "@/api/members/members";
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
it("keeps full administrative member cache separate from stripped picker data", () => {
  const client = new QueryClient();
  const administrative: ListMembersResponse = {
    shape: "admin",
    activeAdminCount: 1,
    nextCursor: null,
    members: [
      {
        memberId: "018f0000-0000-7000-8000-000000000002",
        displayName: "Rosa",
        email: "private@example.com",
        role: "admin",
        status: "active",
        joinedAt: null,
        lastSignedInAt: null,
        lastSeenAt: null,
        removedAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        isLastActiveAdmin: true,
        invitation: null,
        sessions: [],
      },
    ],
  };
  const picker = {
    shape: "directory" as const,
    nextCursor: null,
    members: [
      { memberId: administrative.members[0]!.memberId, displayName: "Rosa" },
    ],
  };
  client.setQueryData(adminMembersQueryOptions.queryKey, administrative);
  client.setQueryData(membersQueryOptions().queryKey, picker);
  expect(client.getQueryData(adminMembersQueryOptions.queryKey)).toEqual(
    administrative,
  );
  expect(client.getQueryData(membersQueryOptions().queryKey)).toEqual(picker);
});
