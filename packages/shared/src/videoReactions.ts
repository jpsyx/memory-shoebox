import { z } from "zod";
import { idSchema, memberRefSchema, timestampSchema } from "./dtos.ts";

/** The emoji choices for a response to a particular video moment. */
export const videoReactionEmojiSchema = z.enum([
  "😂",
  "😍",
  "😮",
  "🙌",
  "👍",
  "👏",
  "❤️",
  "🥹",
  "🎉",
  "💯",
]);

/** An emoji in the video reaction tray. */
export type VideoReactionEmoji = z.infer<typeof videoReactionEmojiSchema>;

/** Stable client IDs make a retry of the same gesture idempotent. */
export const videoReactionParamsSchema = z.object({
  itemId: idSchema,
  reactionId: idSchema,
});

/** One precise reaction, validated before the server clamps to runtime. */
export const putVideoReactionRequestSchema = z.object({
  emoji: videoReactionEmojiSchema,
  atSeconds: z.number().finite().nonnegative(),
});

/** One precise reaction write. */
export type PutVideoReactionRequest = z.infer<
  typeof putVideoReactionRequestSchema
>;

/** Persisted event with author and server-authoritative removal permission. */
export const videoReactionSchema = z.object({
  reactionId: idSchema,
  author: memberRefSchema,
  emoji: videoReactionEmojiSchema,
  atSeconds: z.number().finite().nonnegative(),
  createdAt: timestampSchema,
  canDelete: z.boolean(),
});

/** One persisted, timestamped emoji reaction. */
export type VideoReaction = z.infer<typeof videoReactionSchema>;

/** The newest fifty events; the client arranges these by video position. */
export const videoReactionsSchema = z.array(videoReactionSchema);
