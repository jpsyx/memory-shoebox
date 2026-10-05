import { memberRefSchema, memberRoleSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/**
 * `GET /api/members`, the source of names for the visibility picker.
 *
 * The live route returns either full admin rows or a name-only directory.
 * This picker schema deliberately keeps only names, IDs and the admin role;
 * Zod strips privileged addresses, invitations and devices from these rows.
 * The picker cache stays separate from the full administrative directory.
 */
export const membersResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    members: z.array(memberRefSchema.extend({ role: memberRoleSchema })),
    nextCursor: z.null(),
  }),
  z.object({
    shape: z.literal("directory"),
    members: z.array(memberRefSchema),
    nextCursor: z.null(),
  }),
]);

/** The member list in either of its two shapes. */
export type MembersResponse = z.infer<typeof membersResponseSchema>;

/**
 * Every member, for the picker. Tens of rows; it changes rarely.
 *
 * The key is the picker's: a query for the full rows an admin sees must not
 * share an entry with this stripped shape, or it would be handed a cut-down
 * one.
 */
export function membersQueryOptions(): ReturnType<
  typeof queryOptions<MembersResponse, Error, MembersResponse, string[]>
> {
  return queryOptions({
    queryKey: ["members", "picker"],
    queryFn: (): Promise<MembersResponse> => {
      return apiFetch({ path: "/members", schema: membersResponseSchema });
    },
    staleTime: 5 * 60 * 1000,
  });
}
