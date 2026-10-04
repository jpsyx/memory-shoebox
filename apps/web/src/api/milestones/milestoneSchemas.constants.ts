import {
  milestoneRefSchema,
  memberRefSchema,
  calendarDateSchema,
} from "@memory-shoebox/shared";
import { z } from "zod";

/** Temporary step 7a contract: the per-viewer list row. */
export const milestoneSummarySchema = z.object({
  milestone: milestoneRefSchema,
  itemCount: z.number().int().nonnegative(),
  dayCount: z.number().int().positive(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
/** Temporary step 7a contract: a post-mutation occasion read. */
export const milestoneDetailResponseSchema = milestoneSummarySchema.extend({
  mismatchCount: z.number().int().nonnegative(),
  createdBy: memberRefSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
/** Temporary step 7a contract: one cursor page of occasions. */
export const milestoneListResponseSchema = z.object({
  milestones: z.array(milestoneSummarySchema),
  nextCursor: z.string().nullable(),
});
const fields = {
  name: z.string().trim().min(1).max(120),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema,
  blurb: z.string().trim().max(280).nullable(),
};
/** Pre-ingest creation deliberately cannot carry landed item ids. */
export const createMilestoneBodySchema = z.strictObject(fields).refine(
  (body) => {
    return body.endsOn >= body.startsOn;
  },
  {
    path: ["endsOn"],
    message: "The last day must follow the first day.",
  },
);
/** A delta; the server validates a single date against its stored partner. */
export const updateMilestoneBodySchema = z
  .strictObject(fields)
  .partial()
  .refine(
    (body) => {
      return Object.keys(body).length > 0;
    },
    {
      message: "Choose a change.",
    },
  )
  .refine(
    (body) => {
      return !body.startsOn || !body.endsOn || body.endsOn >= body.startsOn;
    },
    { path: ["endsOn"], message: "The last day must follow the first day." },
  );
