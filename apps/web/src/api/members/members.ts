import { memberRefSchema, memberRoleSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/**
 * `GET /api/members`, the source of names for the visibility picker.
 *
 * **For now this route is not built and answers `404`, so the picker offers
 * what the item already names.** The schema is written from
 * `administration.md` § `GET /api/members`; check the route against it once
 * it exists.
 *
 * The schema is local rather than in `@memory-shoebox/shared` for now: the
 * shared one arrives with the route and replaces this. It names only what
 * the picker reads; `z.object` strips the rest of an admin's row, address and
 * devices included.
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
