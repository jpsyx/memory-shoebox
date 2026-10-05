import type { ListMembersResponse } from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { membersQueryOptions } from "@/api/members/members";

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
