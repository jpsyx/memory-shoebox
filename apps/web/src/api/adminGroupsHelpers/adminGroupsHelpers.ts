import {
  adminGroupDtoSchema,
  listGroupsResponseSchema,
  createGroupRequestSchema,
  renameGroupRequestSchema,
  replaceGroupMembersRequestSchema,
  replaceGroupMembersResponseSchema,
  groupUsageResponseSchema,
  type CreateGroupRequest,
  type AdminGroupDto,
  type ReplaceGroupMembersResponse,
  type GroupUsageResponse,
  type ListGroupsResponse,
} from "@memory-shoebox/shared";
import {
  queryOptions,
  type UnusedSkipTokenOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  apiFetch,
  jsonInit,
  ApiRequestError,
} from "@/api/clientHelpers/clientHelpers";

/** Full administrative rows, isolated from the stripped picker cache. */
export const adminGroupsQueryOptions = queryOptions({
  queryKey: ["groups", "admin"],
  queryFn: async () => {
    const response = await apiFetch({
      path: "/groups",
      schema: listGroupsResponseSchema,
    });
    if (response.shape !== "admin") {
      throw new ApiRequestError({
        status: 403,
        code: "groups_forbidden",
        message: "Only an admin can manage groups.",
      });
    }
    return response;
  },
  staleTime: 0,
} satisfies UnusedSkipTokenOptions<
  Extract<ListGroupsResponse, { shape: "admin" }>,
  Error,
  Extract<ListGroupsResponse, { shape: "admin" }>,
  readonly ["groups", "admin"]
>);
/** Creates a named group with its initial membership. */
export function createGroup(
  body: Readonly<CreateGroupRequest>,
): Promise<AdminGroupDto> {
  return apiFetch({
    path: "/groups",
    schema: adminGroupDtoSchema,
    init: jsonInit({
      method: "POST",
      body: createGroupRequestSchema.parse(body),
    }),
  });
}
/** Changes only the name; membership is a separate write. */
export function renameGroup(
  options: Readonly<{ groupId: string; name: string }>,
): Promise<AdminGroupDto> {
  return apiFetch({
    path: `/groups/${encodeURIComponent(options.groupId)}`,
    schema: adminGroupDtoSchema,
    init: jsonInit({
      method: "PATCH",
      body: renameGroupRequestSchema.parse({ name: options.name }),
    }),
  });
}
/** Replaces the complete membership set. */
export function replaceGroupMembers(
  options: Readonly<{ groupId: string; memberIds: readonly string[] }>,
): Promise<ReplaceGroupMembersResponse> {
  return apiFetch({
    path: `/groups/${encodeURIComponent(options.groupId)}/members`,
    schema: replaceGroupMembersResponseSchema,
    init: jsonInit({
      method: "PUT",
      body: replaceGroupMembersRequestSchema.parse({
        memberIds: options.memberIds,
      }),
    }),
  });
}
/** Fresh directional usage bound to an opaque deletion confirmation. */
export function makeGroupUsageQueryOptionsFromGroupId(
  groupId: string,
): UnusedSkipTokenOptions<
  GroupUsageResponse,
  Error,
  GroupUsageResponse,
  string[]
> {
  return queryOptions({
    queryKey: ["groups", "usage", groupId],
    queryFn: (): Promise<GroupUsageResponse> => {
      return apiFetch({
        path: `/groups/${encodeURIComponent(groupId)}/usage`,
        schema: groupUsageResponseSchema,
      });
    },
    staleTime: 0,
  });
}
/** Deletes with precisely the consent token displayed to the admin. */
export function deleteGroup(
  options: Readonly<{ groupId: string; confirmationToken: string | undefined }>,
): Promise<void> {
  const query =
    options.confirmationToken === undefined
      ? ""
      : `?${new URLSearchParams({ confirmationToken: options.confirmationToken })}`;
  return apiFetch({
    path: `/groups/${encodeURIComponent(options.groupId)}${query}`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
