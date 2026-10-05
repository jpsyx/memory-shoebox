import { idSchema } from "@memory-shoebox/shared";
import { z } from "zod";
const MILESTONE_SEARCH_SCHEMA = z
  .object({
    milestone: idSchema.optional(),
    mode: z
      .enum(["create", "created", "edit", "attach", "fix", "empty", "delete"])
      .optional(),
  })
  .refine((search) => {
    return search.mode === "create"
      ? search.milestone === undefined
      : search.mode === undefined
        ? search.milestone === undefined
        : search.milestone !== undefined;
  }, "This occasion address is not valid.") satisfies z.ZodType;
/** The saved occasion and flow step carried by the browser address. */
export type MilestoneSearch = z.infer<typeof MILESTONE_SEARCH_SCHEMA>;
/** Validates occasion addresses before any surface or mutation can mount. */
export function getMilestoneSearchFromUnknown(
  search: unknown,
): MilestoneSearch {
  return MILESTONE_SEARCH_SCHEMA.parse(search);
}
