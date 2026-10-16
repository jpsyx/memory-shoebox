import { z } from "zod";
import { ImageRecipePurpose } from "./ImageRecipePurpose.ts";

/** Validated size and byte bounds for one photo recipe output. */
export const imageRecipeCandidateSchema = z.object({
  purpose: z.enum(ImageRecipePurpose.values),
  longEdge: z.number().int().positive().max(2048),
  bytes: z
    .number()
    .positive()
    .max(1.5 * 1024 ** 2),
  webpPurpose: z.enum(["display_small_webp", "display_webp"]).optional(),
});

/** One validated image recipe candidate. */
export type ImageRecipeCandidate = z.infer<typeof imageRecipeCandidateSchema>;
