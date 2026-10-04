import { z } from "zod";
import { collectionSchema, cursorSchema } from "../collectionSchema.ts";
import {
  idSchema,
  itemSummarySchema,
  mediaRefSchema,
  memberRefSchema,
  timestampSchema,
} from "../dtos.ts";
import { LIMITS } from "../limits.ts";

/** States of a removal request; there is no accept state or endpoint. */
export const REMOVAL_REQUEST_STATES = [
  "open",
  "deleted",
  "declined",
  "withdrawn",
] as const;
/** The state of one removal request. */
export const removalRequestStateSchema = z.enum(
  REMOVAL_REQUEST_STATES,
) satisfies z.ZodType;
/** The state of one removal request. */
export type RemovalRequestState = z.infer<typeof removalRequestStateSchema>;

/**
 * One removal request, scoped to its requester, snapshot uploader, or admin.
 * Media may be null even while an item exists if the reader lost access.
 */
export const removalRequestDtoSchema = z.object({
  requestId: idSchema,
  state: removalRequestStateSchema,
  itemId: idSchema.nullable(),
  requestedBy: memberRefSchema,
  reason: z.string().nullable(),
  declineReason: z.string().nullable(),
  createdAt: timestampSchema,
  resolvedAt: timestampSchema.nullable(),
  resolvedBy: memberRefSchema.nullable(),
  uploadedBy: memberRefSchema,
  itemCapturedAt: timestampSchema.nullable(),
  media: mediaRefSchema.nullable(),
  canWithdraw: z.boolean(),
  canDecline: z.boolean(),
  canDeleteItem: z.boolean(),
}) satisfies z.ZodType;
/** One three-party-scoped removal request. */
export type RemovalRequestDto = z.infer<typeof removalRequestDtoSchema>;

/** Path for POST /api/items/:itemId/removal-requests. */
export const createRemovalRequestParamsSchema = z.object({
  itemId: idSchema,
}) satisfies z.ZodType;
/** Path for POST /api/items/:itemId/removal-requests. */
export type CreateRemovalRequestParams = z.infer<
  typeof createRemovalRequestParamsSchema
>;

/** Optional own words for POST /api/items/:itemId/removal-requests. */
export const createRemovalRequestRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(LIMITS.freeTextMaxLength)
    .nullable()
    .optional()
    .transform((value) => {
      return value === undefined || value === "" ? null : value;
    }),
}) satisfies z.ZodType;
/** Optional own words for POST /api/items/:itemId/removal-requests. */
export type CreateRemovalRequestRequest = z.infer<
  typeof createRemovalRequestRequestSchema
>;

/** Query for GET /api/removal-requests, scoped by the viewer's role. */
export const listRemovalRequestsRequestSchema = z.object({
  state: z.enum(["open", "settled"]).default("open"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(LIMITS.removalRequestsMaxLimit)
    .default(LIMITS.removalRequestsDefaultLimit),
  cursor: cursorSchema.optional(),
}) satisfies z.ZodType;
/** Query for GET /api/removal-requests. */
export type ListRemovalRequestsRequest = z.infer<
  typeof listRemovalRequestsRequestSchema
>;

/** Path-only request for GET /api/items/:itemId/removal-requests. */
export const listItemRemovalRequestsParamsSchema =
  createRemovalRequestParamsSchema satisfies z.ZodType;
/** Path-only request for GET /api/items/:itemId/removal-requests. */
export type ListItemRemovalRequestsParams = z.infer<
  typeof listItemRemovalRequestsParamsSchema
>;

/** Path for POST /api/removal-requests/:requestId/decline. */
export const declineRemovalRequestParamsSchema = z.object({
  requestId: idSchema,
}) satisfies z.ZodType;
/** Path for POST /api/removal-requests/:requestId/decline. */
export type DeclineRemovalRequestParams = z.infer<
  typeof declineRemovalRequestParamsSchema
>;

/** Compulsory own words for POST /api/removal-requests/:requestId/decline. */
export const declineRemovalRequestRequestSchema = z.object({
  declineReason: z.string().trim().min(1).max(LIMITS.freeTextMaxLength),
}) satisfies z.ZodType;
/** Compulsory own words for POST /api/removal-requests/:requestId/decline. */
export type DeclineRemovalRequestRequest = z.infer<
  typeof declineRemovalRequestRequestSchema
>;

/** Path-only request for POST /api/removal-requests/:requestId/withdraw. */
export const withdrawRemovalRequestParamsSchema =
  declineRemovalRequestParamsSchema satisfies z.ZodType;
/** Path-only request for POST /api/removal-requests/:requestId/withdraw. */
export type WithdrawRemovalRequestParams = z.infer<
  typeof withdrawRemovalRequestParamsSchema
>;

/** Removal-specific refusals, alongside the existing item_not_found code. */
export const REMOVAL_ERROR_CODES = [
  "removal_request_forbidden", // 403
  "removal_queue_forbidden", // 403
  "removal_request_not_found", // 404
  "removal_already_requested", // 409
  "removal_request_not_open", // 409
] as const;
/** Removal-specific refusal codes. */
export type RemovalsErrorCode = (typeof REMOVAL_ERROR_CODES)[number];

/** Response for POST /api/items/:itemId/removal-requests. */
export const createRemovalRequestResponseSchema =
  removalRequestDtoSchema satisfies z.ZodType;
/** Response for POST /api/items/:itemId/removal-requests. */
export type CreateRemovalRequestResponse = z.infer<
  typeof createRemovalRequestResponseSchema
>;

/** Queue page with both tab counts for this reader's scope. */
export const listRemovalRequestsResponseSchema = collectionSchema({
  resourceKey: "removalRequests",
  itemSchema: removalRequestDtoSchema,
}).extend({
  openCount: z.number().int().nonnegative(),
  settledCount: z.number().int().nonnegative(),
}) satisfies z.ZodType;
/** Queue page with both tab counts for this reader's scope. */
export type ListRemovalRequestsResponse = z.infer<
  typeof listRemovalRequestsResponseSchema
>;

/** Item-scoped requests; the item itself still requires visibility. */
export const listItemRemovalRequestsResponseSchema = collectionSchema({
  resourceKey: "removalRequests",
  itemSchema: removalRequestDtoSchema,
}).extend({
  item: itemSummarySchema,
  canRequestRemoval: z.boolean(),
}) satisfies z.ZodType;
/** Item-scoped requests with the complete visible item and ask capability. */
export type ListItemRemovalRequestsResponse = z.infer<
  typeof listItemRemovalRequestsResponseSchema
>;

/** Response for POST /api/removal-requests/:requestId/decline. */
export const declineRemovalRequestResponseSchema =
  removalRequestDtoSchema satisfies z.ZodType;
/** Response for POST /api/removal-requests/:requestId/decline. */
export type DeclineRemovalRequestResponse = z.infer<
  typeof declineRemovalRequestResponseSchema
>;

/** Response for POST /api/removal-requests/:requestId/withdraw. */
export const withdrawRemovalRequestResponseSchema =
  removalRequestDtoSchema satisfies z.ZodType;
/** Response for POST /api/removal-requests/:requestId/withdraw. */
export type WithdrawRemovalRequestResponse = z.infer<
  typeof withdrawRemovalRequestResponseSchema
>;
