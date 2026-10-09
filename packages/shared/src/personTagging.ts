import { z } from "zod";
import { idSchema, personRefSchema } from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/** One suggestion with visible usage and the permitted archive actions. */
export const personTaggingOptionSchema = z.object({
  person: personRefSchema,
  itemCount: z.number().int().nonnegative(),
  canRename: z.boolean(),
  canDelete: z.boolean(),
});

/** One suggestion with visible usage and the permitted archive actions. */
export type PersonTaggingOption = z.infer<typeof personTaggingOptionSchema>;

/** Suggestions for a visible item the caller may people-tag. */
export const personTaggingOptionsResponseSchema = z.object({
  people: z.array(personTaggingOptionSchema),
});

/** Suggestions for a visible item the caller may people-tag. */
export type PersonTaggingOptionsResponse = z.infer<
  typeof personTaggingOptionsResponseSchema
>;

/** A global correction to an ad-hoc person's display name. */
export const renamePersonRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(LIMITS.memberDisplayNameMaxLength),
});

/** A global correction to an ad-hoc person's display name. */
export type RenamePersonRequest = z.infer<typeof renamePersonRequestSchema>;

/** A person action performed in the context of a visible item. */
export const itemPersonParamsSchema = z.object({
  itemId: idSchema,
  personId: idSchema,
});
