import {
  createGroupRequestSchema,
  LIMITS,
  type AdminGroupDto,
  type CreateGroupRequest,
} from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  adminGroupsQueryOptions,
  renameGroup,
  replaceGroupMembers,
} from "@/api/adminGroups/adminGroups";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/** Group validation retains a separate error for each actual schema field. */
export function makeGroupSubmissionFromDraft(
  body: Readonly<{ name: string; memberIds: readonly string[] }>,
): {
  body?: CreateGroupRequest;
  errors: { name?: string; memberIds?: string };
} {
  const result = createGroupRequestSchema.safeParse(body);
  if (result.success) return { body: result.data, errors: {} };
  const fields = new Set(
    result.error.issues.map((issue) => {
      return issue.path[0];
    }),
  );
  return {
    errors: {
      name: fields.has("name")
        ? `Enter a name of 1 to ${LIMITS.groupNameMaxLength} characters.`
        : undefined,
      memberIds: fields.has("memberIds")
        ? "Choose people from this Shoebox."
        : undefined,
    },
  };
}
/** Preserves structured server validation on the matching field. */
export function groupFieldError(
  options: Readonly<{ error: Error | null; field: string }>,
): string | undefined {
  if (!(options.error instanceof ApiRequestError)) return undefined;
  const errors = options.error.details?.fieldErrors?.[options.field];
  return Array.isArray(errors) ? errors.join(" ") : undefined;
}
/** Applies a successful rename before attempting the separate membership write. */
export async function saveGroupDraft(
  options: Readonly<{
    queryClient: QueryClient;
    group: AdminGroupDto;
    name: string;
    memberIds: readonly string[];
    onRenamed: (group: AdminGroupDto) => void;
  }>,
): Promise<void> {
  if (options.name !== options.group.name) {
    requireGroupAuthority(options.queryClient);
    const renamed = await renameGroup({
      groupId: options.group.groupId,
      name: options.name,
    });
    options.queryClient.setQueryData(
      adminGroupsQueryOptions.queryKey,
      (list) => {
        return list === undefined
          ? undefined
          : {
              ...list,
              groups: list.groups.map((group) => {
                return group.groupId === renamed.groupId ? renamed : group;
              }),
            };
      },
    );
    options.onRenamed(renamed);
  }
  requireGroupAuthority(options.queryClient);
  await replaceGroupMembers({
    groupId: options.group.groupId,
    memberIds: options.memberIds,
  });
}

/** Combines local and server errors without binding them to unrelated fields. */
export function makeGroupFieldErrorsFromFailures(
  options: Readonly<{
    errors: { name?: string; memberIds?: string };
    error: Error | null;
  }>,
): { name?: string; memberIds?: string } {
  return {
    name:
      options.errors.name ??
      groupFieldError({ error: options.error, field: "name" }),
    memberIds:
      options.errors.memberIds ??
      groupFieldError({ error: options.error, field: "memberIds" }),
  };
}
