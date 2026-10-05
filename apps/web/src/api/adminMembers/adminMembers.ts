import {
  listMembersResponseSchema,
  adminMemberDtoSchema,
  type InviteMemberRequest,
  type AdminMemberDto,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Full admin directory, kept separate from the stripped picker cache. */
export const adminMembersQueryOptions = queryOptions({
  queryKey: ["members", "admin"],
  queryFn: () => {
    return apiFetch({ path: "/members", schema: listMembersResponseSchema });
  },
  staleTime: 0,
});
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
