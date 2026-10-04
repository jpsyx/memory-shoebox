import { z } from "zod";
import { createSessionResponseSchema, normalisedEmailSchema } from "./auth.ts";
import { LIMITS } from "./limits.ts";
import { SETTING_DEFINITIONS } from "./settings.ts";

/** Anonymous first-admin creation with registry-backed instance values. */
export const createSetupRequestSchema = z.strictObject({
  admin: z.strictObject({
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.memberDisplayNameMaxLength),
    email: normalisedEmailSchema,
  }),
  shoebox: z.strictObject({
    name: SETTING_DEFINITIONS["shoebox.name"].schema,
    timezone: SETTING_DEFINITIONS["shoebox.timezone"].schema,
  }),
  public: z.strictObject({
    baseUrl: SETTING_DEFINITIONS["public.base_url"].schema.pipe(z.string()),
  }),
  mail: z
    .strictObject({
      fromAddress: SETTING_DEFINITIONS["mail.from_address"].schema,
      fromName: SETTING_DEFINITIONS["mail.from_name"].schema,
    })
    .optional(),
});

/** Anonymous first-admin creation with registry-backed instance values. */
export type CreateSetupRequest = z.infer<typeof createSetupRequestSchema>;

/** Anonymous setup availability, with no catalog or member facts. */
export const setupStatusResponseSchema = z.object({ isRequired: z.boolean() });

/** Anonymous setup availability, with no catalog or member facts. */
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

/** Invitation onboarding still pending for the current admin. */
export const setupProgressResponseSchema = z.object({
  needsInvitations: z.boolean(),
});

/** Invitation onboarding still pending for the current admin. */
export type SetupProgressResponse = z.infer<typeof setupProgressResponseSchema>;

/** The standard session bootstrap returned by first-admin creation. */
export const createSetupResponseSchema = createSessionResponseSchema;

/** The standard session bootstrap returned by first-admin creation. */
export type CreateSetupResponse = z.infer<typeof createSetupResponseSchema>;
