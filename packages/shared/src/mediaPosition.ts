import { z } from "zod";
import { idSchema } from "./dtos.ts";
import { timelineSelectionSchema } from "./timeline/selection.ts";

/** The current item and the exact selection used by media navigation. */
export const mediaPositionRequestSchema = z.strictObject({
  itemId: idSchema,
  selection: timelineSelectionSchema,
});

/** Inputs to a visibility-filtered position read. */
export type MediaPositionRequest = z.infer<typeof mediaPositionRequestSchema>;

/** Hidden, missing and out-of-selection items expose no archive counts. */
export const mediaPositionResponseSchema = z
  .strictObject({
    position: z.number().int().positive(),
    total: z.number().int().positive(),
  })
  .refine(
    (counter) => {
      return counter.position <= counter.total;
    },
    {
      message: "Position cannot exceed total",
    },
  )
  .nullable();

/** A dense one-based position among every visible matching media frame. */
export type MediaPositionResponse = z.infer<typeof mediaPositionResponseSchema>;
