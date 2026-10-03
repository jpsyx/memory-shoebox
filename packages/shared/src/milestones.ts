import { z } from "zod";
import { collectionSchema, cursorSchema } from "./collectionSchema.ts";
import {
  calendarDateSchema,
  idSchema,
  itemSummarySchema,
  memberRefSchema,
  milestoneRefSchema,
  timestampSchema,
} from "./dtos.ts";
import { LIMITS } from "./limits.ts";
import { dayMilestoneBandSchema } from "./timeline.ts";

const milestoneNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.milestoneNameMaxLength);
const milestoneBlurbSchema = z
  .string()
  .trim()
  .max(LIMITS.milestoneBlurbMaxLength)
  .nullable()
  .transform((value) => {
    return value === "" ? null : value;
  });
const milestoneItemIdsSchema = z
  .array(idSchema)
  .max(LIMITS.milestoneBatchMaxItems)
  .refine(
    (ids) => {
      return new Set(ids).size === ids.length;
    },
    { error: "Item IDs must be unique." },
  );
const milestonePageSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(LIMITS.milestoneMaxLimit)
    .default(LIMITS.milestoneDefaultLimit),
  cursor: cursorSchema.optional(),
});

function _addRangeIssues(
  range: Readonly<{ from?: string; to?: string }>,
  context: z.RefinementCtx,
): void {
  if (
    range.from !== undefined &&
    range.to !== undefined &&
    range.to < range.from
  ) {
    context.addIssue({
      code: "custom",
      message: "The end must not precede the start.",
      path: ["to"],
    });
  }
}

/** Query for GET /api/milestones, with inclusive overlapping-span bounds. */
export const listMilestonesRequestSchema = milestonePageSchema
  .extend({
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
  })
  .superRefine(_addRangeIssues);
/** Query for GET /api/milestones. */
export type ListMilestonesRequest = z.infer<typeof listMilestonesRequestSchema>;

/** Body for POST /api/milestones; the client supplies both span ends. */
export const createMilestoneRequestSchema = z
  .object({
    name: milestoneNameSchema,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema,
    blurb: milestoneBlurbSchema,
    itemIds: milestoneItemIdsSchema.optional(),
  })
  .refine(
    (body) => {
      return body.endsOn >= body.startsOn;
    },
    { error: "The end must not precede the start.", path: ["endsOn"] },
  );
/** Body for POST /api/milestones. */
export type CreateMilestoneRequest = z.infer<
  typeof createMilestoneRequestSchema
>;

/** Path parameter for every milestone-scoped route. */
export const milestoneIdParamsSchema = z.object({ milestoneId: idSchema });
/** Path parameter for every milestone-scoped route. */
export type MilestoneIdParams = z.infer<typeof milestoneIdParamsSchema>;

/** Path-only request for GET /api/milestones/:milestoneId. */
export const getMilestoneRequestSchema = milestoneIdParamsSchema;
/** Path-only request for GET /api/milestones/:milestoneId. */
export type GetMilestoneRequest = z.infer<typeof getMilestoneRequestSchema>;

/**
 * Body for PATCH /api/milestones/:milestoneId.
 * The service validates dates after merging them with the stored span.
 */
export const updateMilestoneRequestSchema = z
  .object({
    name: milestoneNameSchema.optional(),
    startsOn: calendarDateSchema.optional(),
    endsOn: calendarDateSchema.optional(),
    blurb: milestoneBlurbSchema.optional(),
  })
  .refine(
    (body) => {
      return Object.values(body).some((value) => {
        return value !== undefined;
      });
    },
    { error: "Supply at least one milestone field." },
  );
/** Partial body for PATCH /api/milestones/:milestoneId. */
export type UpdateMilestoneRequest = z.infer<
  typeof updateMilestoneRequestSchema
>;

/** Path-only request for DELETE /api/milestones/:milestoneId. */
export const deleteMilestoneRequestSchema = milestoneIdParamsSchema;
/** Path-only request for DELETE /api/milestones/:milestoneId. */
export type DeleteMilestoneRequest = z.infer<
  typeof deleteMilestoneRequestSchema
>;

/** Attachment delta for PATCH /api/milestones/:milestoneId/items. */
export const setMilestoneItemsRequestSchema = z
  .object({
    attach: milestoneItemIdsSchema,
    detach: milestoneItemIdsSchema,
  })
  .superRefine((body, context) => {
    if (body.attach.length + body.detach.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Supply an attachment or detachment.",
        path: ["attach"],
      });
    }
    const detachIds = new Set(body.detach);
    if (
      body.attach.some((id) => {
        return detachIds.has(id);
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "An item cannot be attached and detached together.",
        path: ["detach"],
      });
    }
  });
/** Attachment delta for PATCH /api/milestones/:milestoneId/items. */
export type SetMilestoneItemsRequest = z.infer<
  typeof setMilestoneItemsRequestSchema
>;

/** Query for GET /api/milestones/:milestoneId/candidates. */
export const listMilestoneCandidatesRequestSchema = milestonePageSchema
  .extend({
    scope: z.enum(["span", "all"]).default("span"),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.milestoneMaxLimit)
      .default(LIMITS.milestoneCandidatesDefaultLimit),
  })
  .superRefine((query, context) => {
    _addRangeIssues(query, context);
    if (query.scope === "span") {
      (["from", "to"] as const).forEach((field) => {
        if (query[field] !== undefined) {
          context.addIssue({
            code: "custom",
            message: "Date bounds require scope all.",
            path: [field],
          });
        }
      });
    }
  });
/** Query for GET /api/milestones/:milestoneId/candidates. */
export type ListMilestoneCandidatesRequest = z.infer<
  typeof listMilestoneCandidatesRequestSchema
>;

/** Query for GET /api/milestones/:milestoneId/mismatches. */
export const listMilestoneMismatchesRequestSchema = milestonePageSchema;
/** Query for GET /api/milestones/:milestoneId/mismatches. */
export type ListMilestoneMismatchesRequest = z.infer<
  typeof listMilestoneMismatchesRequestSchema
>;

/** Body for POST /api/milestones/:milestoneId/reconcile. */
export const reconcileMilestoneRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("move"),
    moves: z
      .array(z.object({ itemId: idSchema, targetOn: calendarDateSchema }))
      .min(1)
      .max(LIMITS.milestoneBatchMaxItems)
      .refine(
        (moves) => {
          return (
            new Set(
              moves.map((move) => {
                return move.itemId;
              }),
            ).size === moves.length
          );
        },
        { error: "Move item IDs must be unique." },
      ),
  }),
  z.object({
    mode: z.literal("acknowledge"),
    itemIds: milestoneItemIdsSchema.min(1),
  }),
]);
/** Body for POST /api/milestones/:milestoneId/reconcile. */
export type ReconcileMilestoneRequest = z.infer<
  typeof reconcileMilestoneRequestSchema
>;

/** Milestone refusals; invisible items use the existing item_not_found code. */
export const MILESTONE_ERROR_CODES = [
  "milestone_not_found", // 404
  "milestone_forbidden", // 403
  "milestone_attachment_missing", // 409
] as const;
/** Milestone-specific refusal codes. */
export type MilestonesErrorCode = (typeof MILESTONE_ERROR_CODES)[number];

/** List row with a frozen occasion reference and this viewer's counts. */
export const milestoneSummarySchema = z.object({
  milestone: milestoneRefSchema,
  itemCount: z.number().int().nonnegative(),
  dayCount: z.number().int().positive(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
/** One row of the milestone list. */
export type MilestoneSummary = z.infer<typeof milestoneSummarySchema>;

/** Detail consumed by the edit form, empty state, and deletion dialog. */
export const milestoneDetailSchema = milestoneSummarySchema.extend({
  mismatchCount: z.number().int().nonnegative(),
  createdBy: memberRefSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
/** Milestone detail with per-viewer mismatch count and nullable creator. */
export type MilestoneDetail = z.infer<typeof milestoneDetailSchema>;

/** A complete item offered by the attachment picker. */
export const milestoneCandidateSchema = z.object({
  item: itemSummarySchema,
  isAttached: z.boolean(),
  isOutsideSpan: z.boolean(),
});
/** A complete item offered by the attachment picker. */
export type MilestoneCandidate = z.infer<typeof milestoneCandidateSchema>;

/** One visible, unacknowledged attachment outside the occasion's span. */
export const milestoneMismatchSchema = z.object({
  item: itemSummarySchema,
  attachedAt: timestampSchema,
});
/** One visible, unacknowledged attachment outside the occasion's span. */
export type MilestoneMismatch = z.infer<typeof milestoneMismatchSchema>;

/** Response for GET /api/milestones. */
export const listMilestonesResponseSchema = collectionSchema({
  resourceKey: "milestones",
  itemSchema: milestoneSummarySchema,
});
/** Response for GET /api/milestones. */
export type ListMilestonesResponse = z.infer<
  typeof listMilestonesResponseSchema
>;

/** Response for POST /api/milestones. */
export const createMilestoneResponseSchema = milestoneDetailSchema;
/** Response for POST /api/milestones. */
export type CreateMilestoneResponse = z.infer<
  typeof createMilestoneResponseSchema
>;

/** Response for GET /api/milestones/:milestoneId. */
export const getMilestoneResponseSchema = milestoneDetailSchema;
/** Response for GET /api/milestones/:milestoneId. */
export type GetMilestoneResponse = z.infer<typeof getMilestoneResponseSchema>;

/** Response for PATCH /api/milestones/:milestoneId. */
export const updateMilestoneResponseSchema = milestoneDetailSchema;
/** Response for PATCH /api/milestones/:milestoneId. */
export type UpdateMilestoneResponse = z.infer<
  typeof updateMilestoneResponseSchema
>;

/** Response for DELETE /api/milestones/:milestoneId; no item is deleted. */
export const deleteMilestoneResponseSchema = z.object({
  milestoneId: idSchema,
  name: z.string(),
  detachedItemCount: z.number().int().nonnegative(),
});
/** Response for DELETE /api/milestones/:milestoneId. */
export type DeleteMilestoneResponse = z.infer<
  typeof deleteMilestoneResponseSchema
>;

/** Detail and actual delta counts after PATCH milestone items. */
export const setMilestoneItemsResponseSchema = milestoneDetailSchema.extend({
  attachedCount: z.number().int().nonnegative(),
  detachedCount: z.number().int().nonnegative(),
});
/** Detail and actual delta counts after PATCH milestone items. */
export type SetMilestoneItemsResponse = z.infer<
  typeof setMilestoneItemsResponseSchema
>;

/** Response for GET /api/milestones/:milestoneId/candidates. */
export const listMilestoneCandidatesResponseSchema = collectionSchema({
  resourceKey: "candidates",
  itemSchema: milestoneCandidateSchema,
});
/** Response for GET /api/milestones/:milestoneId/candidates. */
export type ListMilestoneCandidatesResponse = z.infer<
  typeof listMilestoneCandidatesResponseSchema
>;

/** Mismatch page with a widening span calculated over the whole visible set. */
export const listMilestoneMismatchesResponseSchema = collectionSchema({
  resourceKey: "mismatches",
  itemSchema: milestoneMismatchSchema,
}).extend({
  milestone: milestoneRefSchema,
  wideningSpan: z.object({
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema,
  }),
});
/** Mismatch page and full-set widening span. */
export type ListMilestoneMismatchesResponse = z.infer<
  typeof listMilestoneMismatchesResponseSchema
>;

/** Reconciliation results and other occasions with newly raised mismatches. */
export const reconcileMilestoneResponseSchema = milestoneDetailSchema.extend({
  movedCount: z.number().int().nonnegative(),
  acknowledgedCount: z.number().int().nonnegative(),
  raisedElsewhere: z.array(
    z.object({
      milestone: milestoneRefSchema,
      mismatchCount: z.number().int().nonnegative(),
    }),
  ),
});
/** Reconciliation results and other occasions with newly raised mismatches. */
export type ReconcileMilestoneResponse = z.infer<
  typeof reconcileMilestoneResponseSchema
>;

/** The full band shape from the milestone slice, shared with the timeline. */
export const milestoneBandDtoSchema = dayMilestoneBandSchema;
/** The full band shape from the milestone slice. */
export type MilestoneBandDto = z.infer<typeof milestoneBandDtoSchema>;

/** Resolved band and continuation bands from the milestone slice. */
export const dayMilestonesDtoSchema = z.object({
  band: milestoneBandDtoSchema.nullable(),
  continues: z.array(milestoneBandDtoSchema),
});
/** Resolved band and continuation bands from the milestone slice. */
export type DayMilestonesDto = z.infer<typeof dayMilestonesDtoSchema>;
