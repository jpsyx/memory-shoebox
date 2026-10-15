import { z } from "zod";
import { meResponseSchema } from "../auth.ts";
import {
  setupProgressResponseSchema,
  setupStatusResponseSchema,
} from "../setup.ts";

/** Current navigation authority and setup state from one request. */
export const bootstrapResponseSchema = z.object({
  setup: setupStatusResponseSchema,
  account: meResponseSchema.nullable(),
  progress: setupProgressResponseSchema.nullable(),
}) satisfies z.ZodType;

/** Anonymous callers carry neither an account nor private setup progress. */
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
