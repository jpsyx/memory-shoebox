import { memberRefSchema, memberRoleSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/api/client/client";

/**
 * `GET /api/members`, the source of names for the visibility picker.
 *
 * **Step 8a builds this route and has not merged.** The client is written now
 * against `administration.md` § `GET /api/members`, exactly as step 5b wrote
 * the burst fan against step 5a's contract, so the picker works the day 8a
 * lands (decision 8 of the step 6b design). Until then the route answers
 * `404` and the picker offers what the item already names.
 *
 * The schema is local rather than in `@memory-shoebox/shared`, because 8a owns
 * the shared one and will replace this. It names only what the picker reads;
 * `z.object` strips the rest of an admin's row, address and devices included.
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
 * The key is the picker's: step 8a's admin queries return full rows, and
 * sharing an entry with this stripped shape would hand them a cut-down one.
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
