import { idSchema, memberRefSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/**
 * `GET /api/groups`, the group half of the visibility picker.
 *
 * **For now the route is not built, so this is written against
 * `administration.md`**, for the reason `api/members/members.ts` gives. The
 * usage counts on an admin's row are deliberately not read: they count items,
 * and the picker has no use for them.
 */
export const groupsResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    groups: z.array(
      z.object({
        groupId: idSchema,
        name: z.string(),
        members: z.array(memberRefSchema),
      }),
    ),
    nextCursor: z.null(),
  }),
  z.object({
    shape: z.literal("picker"),
    groups: z.array(z.object({ groupId: idSchema, name: z.string() })),
    nextCursor: z.null(),
  }),
]);

/** The group list in either of its two shapes. */
export type GroupsResponse = z.infer<typeof groupsResponseSchema>;

/**
 * Every group, for the picker.
 *
 * The key is the picker's: a query for the full rows an admin sees must not
 * share an entry with this stripped shape, or it would be handed a cut-down
 * one.
 */
export function groupsQueryOptions(): ReturnType<
  typeof queryOptions<GroupsResponse, Error, GroupsResponse, string[]>
> {
  return queryOptions({
    queryKey: ["groups", "picker"],
    queryFn: (): Promise<GroupsResponse> => {
      return apiFetch({ path: "/groups", schema: groupsResponseSchema });
    },
    staleTime: 5 * 60 * 1000,
  });
}
