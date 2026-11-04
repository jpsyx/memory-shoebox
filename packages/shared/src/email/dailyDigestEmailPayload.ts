import { z } from "zod";
import { calendarDateSchema, signedUrlSchema } from "../dtos.ts";
import { emailCommonSchema } from "./emailCommon.constants.ts";

const commentEntrySchema = z.object({
  sourceId: z.string(),
  itemId: z.string(),
  authorDisplayName: z.string(),
  excerpt: z.string().refine((value) => {
    return Array.from(value).length <= 200;
  }),
  url: signedUrlSchema,
});
const commentSectionSchema = z
  .object({
    totalEvents: z.number().int().nonnegative(),
    entries: z.array(commentEntrySchema).max(20),
  })
  .refine((section) => {
    return section.entries.length <= section.totalEvents;
  });
const uploadSectionSchema = z
  .object({
    totalEvents: z.number().int().nonnegative(),
    totalVisibleItems: z.number().int().nonnegative(),
    entries: z
      .array(
        z.object({
          sourceId: z.string(),
          uploaderDisplayName: z.string(),
          visibleItemCount: z.number().int().positive(),
          url: signedUrlSchema,
        }),
      )
      .max(20),
  })
  .refine((section) => {
    return section.entries.length <= section.totalEvents;
  });

/** A bounded combined digest with only recipient-visible activity. */
export const dailyDigestEmailPayloadSchema = emailCommonSchema
  .extend({
    periodStart: calendarDateSchema,
    periodEnd: calendarDateSchema,
    shoeboxUrl: signedUrlSchema,
    uploads: uploadSectionSchema,
    comments: commentSectionSchema,
    commentTags: commentSectionSchema,
  })
  .refine((payload) => {
    return (
      payload.uploads.totalEvents +
        payload.comments.totalEvents +
        payload.commentTags.totalEvents >
      0
    );
  })
  .refine((payload) => {
    return payload.periodStart <= payload.periodEnd;
  });
/** Frozen summary used by the pure email renderer. */
export type DailyDigestEmailPayload = z.infer<
  typeof dailyDigestEmailPayloadSchema
>;
