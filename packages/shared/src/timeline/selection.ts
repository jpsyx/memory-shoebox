import { z } from "zod";
import { calendarDateSchema, idSchema } from "../dtos.ts";

/** The archive selection as JSON, without client SQL or opaque cursors. */
export const timelineSelectionSchema = z.strictObject({
  tags: z.array(idSchema),
  people: z.array(idSchema),
  /** Inclusive capture dates, including any effective jump boundary. */
  from: calendarDateSchema.optional(),
  until: calendarDateSchema.optional(),
  /** Attachment-picker fields; ordinary archive selections omit these. */
  attachedToMilestoneId: idSchema.optional(),
  excludeAttached: z.boolean().optional(),
});

/** Shared selection for archive navigation and filtered attachment picking. */
export type TimelineSelection = z.infer<typeof timelineSelectionSchema>;
