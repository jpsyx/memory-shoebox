import { z } from "zod";

/** Delivery choices for activity emails. */
export const notificationFrequencySchema = z.enum([
  "off",
  "immediate",
  "daily",
]);
/** One activity category's delivery choice. */
export type NotificationFrequency = z.infer<typeof notificationFrequencySchema>;
/** Categories that can be combined into a digest. */
export const activityNotificationCategorySchema = z.enum([
  "upload",
  "comment",
  "comment_tag",
]);
/** One digest-capable activity category. */
export type ActivityNotificationCategory = z.infer<
  typeof activityNotificationCategorySchema
>;
/** Defaults for new members and the one-time preference migration. */
export const DEFAULT_ACTIVITY_FREQUENCIES = {
  onUpload: "daily",
  onComment: "daily",
  onCommentTag: "immediate",
} as const;
