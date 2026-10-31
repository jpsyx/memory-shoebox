import { z } from "zod";
import { avatarRefSchema, idSchema, timestampSchema } from "./dtos.ts";

/** Crop center after orientation, with bounded magnification. */
export const avatarCropSchema = z.object({
  centerX: z.number().min(0).max(1),
  centerY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(8),
});
/** Validated crop selected by the member. */
export type AvatarCrop = z.infer<typeof avatarCropSchema>;
/** Reserve one still-image upload without publishing it. */
export const reserveAvatarRequestSchema = z.object({
  expectedAvatarId: idSchema.nullable(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  crop: avatarCropSchema,
});
/** An immutable reservation identity and its ten-minute deadline. */
export const reserveAvatarResponseSchema = z.object({
  avatarId: idSchema,
  expiresAt: timestampSchema,
});
/** Optimistic version required when removing an avatar. */
export const removeAvatarRequestSchema = z.object({
  expectedAvatarId: idSchema.nullable(),
});
/** Private renewal response, including unknown and image-free members. */
export const readMemberAvatarResponseSchema = z.object({
  avatar: avatarRefSchema.nullable(),
});
/** Own-avatar reservation envelope. */
export type ReserveAvatarRequest = z.infer<typeof reserveAvatarRequestSchema>;
/** Own-avatar reservation result. */
export type ReserveAvatarResponse = z.infer<typeof reserveAvatarResponseSchema>;
