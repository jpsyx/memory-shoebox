import {
  type ListMembersResponse,
  listMembersResponseSchema,
  adminMemberDtoSchema,
  type InviteMemberRequest,
  type AdminMemberDto,
} from "@memory-shoebox/shared";
import type { UnusedSkipTokenOptions } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Full admin directory, kept separate from the stripped picker cache. */
export const adminMembersQueryOptions = queryOptions({
  queryKey: ["members", "admin"],
  queryFn: () => {
    return apiFetch({ path: "/members", schema: listMembersResponseSchema });
  },
  staleTime: 0,
}) satisfies UnusedSkipTokenOptions<
  ListMembersResponse,
  Error,
  ListMembersResponse,
  string[]
>;
/** Queues an invitation through the existing administrative member API. */
export function inviteMember(
  body: Readonly<InviteMemberRequest>,
): Promise<AdminMemberDto> {
  return apiFetch({
    path: "/members",
    schema: adminMemberDtoSchema,
    init: jsonInit({ method: "POST", body }),
  });
}
