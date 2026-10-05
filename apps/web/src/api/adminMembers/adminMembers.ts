import {
  adminMemberDtoSchema,
  changeMemberRoleRequestSchema,
  inviteMemberRequestSchema,
  listMemberSuggestionsRequestSchema,
  listMemberSuggestionsResponseSchema,
  type ListMemberSuggestionsResponse,
  type AdminMemberDto,
  type ChangeMemberRoleRequest,
  type InviteMemberRequest,
} from "@memory-shoebox/shared";
import {
  queryOptions,
  type UnusedSkipTokenOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
import { inviteMember } from "@/api/inviteMember";

/** Normalizes an invitation and delegates to the existing invitation helper. */
export function inviteAdminMember(
  body: Readonly<InviteMemberRequest>,
): Promise<AdminMemberDto> {
  return inviteMember(inviteMemberRequestSchema.parse(body));
}
/** Name suggestions keyed by the normalized address, separate from directories. */
export function memberSuggestionsQueryOptions(
  email: string,
): UnusedSkipTokenOptions<
  ListMemberSuggestionsResponse,
  Error,
  ListMemberSuggestionsResponse,
  string[]
> {
  const query = listMemberSuggestionsRequestSchema.parse({ email });
  return queryOptions({
    queryKey: ["member-suggestions", query.email],
    queryFn: () => {
      return apiFetch({
        path: `/member-suggestions?${new URLSearchParams(query)}`,
        schema: listMemberSuggestionsResponseSchema,
      });
    },
  });
}
/** Explicitly changes one identity's authority. */
export function changeMemberRole(
  options: Readonly<ChangeMemberRoleRequest & { memberId: string }>,
): Promise<AdminMemberDto> {
  return apiFetch({
    path: `/members/${encodeURIComponent(options.memberId)}`,
    schema: adminMemberDtoSchema,
    init: jsonInit({
      method: "PATCH",
      body: changeMemberRoleRequestSchema.parse({ role: options.role }),
    }),
  });
}
/** Removes access while preserving historical identity and content. */
export function removeMember(memberId: string): Promise<AdminMemberDto> {
  return apiFetch({
    path: `/members/${encodeURIComponent(memberId)}`,
    schema: adminMemberDtoSchema,
    init: { method: "DELETE" },
  });
}
/** Queues another copy of the latest unspent invitation. */
export function resendMemberInvitation(
  memberId: string,
): Promise<AdminMemberDto> {
  return apiFetch({
    path: `/members/${encodeURIComponent(memberId)}/invitation/resend`,
    schema: adminMemberDtoSchema,
    init: { method: "POST" },
  });
}
/** Revokes the invitation and the invited identity's access. */
export function revokeMemberInvitation(
  memberId: string,
): Promise<AdminMemberDto> {
  return apiFetch({
    path: `/members/${encodeURIComponent(memberId)}/invitation`,
    schema: adminMemberDtoSchema,
    init: { method: "DELETE" },
  });
}
/** Revokes the matching device, including the current admin's own device. */
export function revokeMemberSession(
  options: Readonly<{ memberId: string; sessionId: string }>,
): Promise<void> {
  return apiFetch({
    path: `/members/${encodeURIComponent(options.memberId)}/sessions/${encodeURIComponent(options.sessionId)}`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
