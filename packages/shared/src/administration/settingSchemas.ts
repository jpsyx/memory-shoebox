import { z } from "zod";
import {
  memberRefSchema,
  milestoneRefSchema,
  timestampSchema,
} from "../dtos.ts";
import {
  EDITABLE_INSTANCE_SETTING_KEYS,
  SETTING_DEFINITIONS,
} from "../settings.ts";

/** A setting key writable through instance administration. */
export const editableInstanceSettingKeySchema = z.enum(
  EDITABLE_INSTANCE_SETTING_KEYS,
) satisfies z.ZodType;

/** Indexed media totals for an administrator. */
export const storageUsageDtoSchema = z.object({
  itemCount: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
}) satisfies z.ZodType;

/** Indexed media totals for an administrator. */
export type StorageUsageDto = z.infer<typeof storageUsageDtoSchema>;

/** The six resolved, editable instance values. */
export const resolvedSettingsSchema = z.object({
  shoebox: z.object({
    name: SETTING_DEFINITIONS["shoebox.name"].schema,
    timezone: SETTING_DEFINITIONS["shoebox.timezone"].schema,
  }),
  pile: z.object({
    arrangement: SETTING_DEFINITIONS["pile.arrangement"].schema,
  }),
  mail: z.object({
    fromAddress: SETTING_DEFINITIONS["mail.from_address"].schema,
    fromName: SETTING_DEFINITIONS["mail.from_name"].schema,
  }),
  public: z.object({ baseUrl: SETTING_DEFINITIONS["public.base_url"].schema }),
}) satisfies z.ZodType;

/** The six resolved, editable instance values. */
export type ResolvedSettings = z.infer<typeof resolvedSettingsSchema>;

/** Resolved administration settings, provenance, storage and deployed version. */
export const getSettingsResponseSchema = resolvedSettingsSchema.extend({
  version: z.string(),
  defaultedKeys: z.array(editableInstanceSettingKeySchema),
  changedBy: z.array(
    z.object({
      key: editableInstanceSettingKeySchema,
      updatedAt: timestampSchema,
      updatedBy: memberRefSchema.nullable(),
    }),
  ),
  storage: storageUsageDtoSchema,
}) satisfies z.ZodType;

/** Resolved administration settings, provenance, storage and deployed version. */
export type GetSettingsResponse = z.infer<typeof getSettingsResponseSchema>;

/** Partial settings body and optional preview query, strictly validated. */
export const updateSettingsRequestSchema = z.strictObject({
  preview: z.boolean().optional(),
  shoebox: z
    .strictObject({
      name: SETTING_DEFINITIONS["shoebox.name"].schema.optional(),
      timezone: SETTING_DEFINITIONS["shoebox.timezone"].schema.optional(),
    })
    .optional(),
  pile: z
    .strictObject({
      arrangement: SETTING_DEFINITIONS["pile.arrangement"].schema.optional(),
    })
    .optional(),
  mail: z
    .strictObject({
      fromAddress: SETTING_DEFINITIONS["mail.from_address"].schema.optional(),
      fromName: SETTING_DEFINITIONS["mail.from_name"].schema.optional(),
    })
    .optional(),
  public: z
    .strictObject({
      baseUrl: SETTING_DEFINITIONS["public.base_url"].schema
        .pipe(z.string())
        .optional(),
    })
    .optional(),
}) satisfies z.ZodType;

/** Partial settings body and optional preview query, strictly validated. */
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/** Date, burst and milestone consequences of changing the instance zone. */
export const timezoneImpactDtoSchema = z.object({
  fromZone: SETTING_DEFINITIONS["shoebox.timezone"].schema,
  toZone: SETTING_DEFINITIONS["shoebox.timezone"].schema,
  movingItemCount: z.number().int().nonnegative(),
  burstEjectionItemCount: z.number().int().nonnegative(),
  milestoneMismatches: z.array(
    z.object({
      milestone: milestoneRefSchema,
      itemCount: z.number().int().nonnegative(),
    }),
  ),
}) satisfies z.ZodType;

/** Date, burst and milestone consequences of changing the instance zone. */
export type TimezoneImpactDto = z.infer<typeof timezoneImpactDtoSchema>;

/** Resolved settings and the computed change or preview consequences. */
export const updateSettingsResponseSchema = getSettingsResponseSchema.extend({
  isPreview: z.boolean(),
  timezoneImpact: timezoneImpactDtoSchema.nullable(),
}) satisfies z.ZodType;

/** Resolved settings and the computed change or preview consequences. */
export type UpdateSettingsResponse = z.infer<
  typeof updateSettingsResponseSchema
>;
