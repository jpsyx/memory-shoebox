import { z } from "zod";

import { idSchema } from "../dtos.ts";

import { resolveVisibilityRuleRequestSchema } from "../itemEdits.ts";

import { LIMITS, UPLOAD_LIMITS } from "../limits.ts";

import { uploadEditKindSchema } from "./uploadValueSchemas.constants.ts";

/**
 * The write shape for one subject of a visibility rule: the element of
 * `resolveVisibilityRuleRequestSchema.subjects`, taken from it rather than
 * restated, so the item slice's rule resolver and this slice's batch rule
 * cannot drift apart.
 */
export const visibilitySubjectInputSchema =
  resolveVisibilityRuleRequestSchema.shape.subjects.unwrap().element;

/** The write shape for one subject of a visibility rule. */
export type VisibilitySubjectInput = z.infer<
  typeof visibilitySubjectInputSchema
>;

/**
 * `PATCH /api/upload-sessions/:sessionId/visibility`: one rule for the
 * whole batch. The body is `resolveVisibilityRuleRequestSchema`'s (mode plus
 * subjects, the list defaulting to empty), with the one refinement this
 * route adds: `everyone` takes no subjects; `only` and `except` take at
 * least one, because the control's "Nobody yet" state is pre-submit.
 */
export const setUploadVisibilityRequestSchema =
  resolveVisibilityRuleRequestSchema.refine(
    (body) => {
      return (body.mode === "everyone") === (body.subjects.length === 0);
    },
    {
      message: "Everyone takes no subjects; only and except take some.",
      path: ["subjects"],
    },
  );

/** `PATCH /api/upload-sessions/:sessionId/visibility`. */
export type SetUploadVisibilityRequest = z.infer<
  typeof setUploadVisibilityRequestSchema
>;

/** The body of `POST .../edits`, before the per-kind rule is checked. */
const createUploadEditBodySchema = z.object({
  kind: uploadEditKindSchema,
  /** Every id must belong to this session. */
  targetFileIds: z
    .array(idSchema)
    .min(1)
    .max(UPLOAD_LIMITS.editTargetsPerRequest),
  /** An existing tag chosen from the picker. */
  tagId: idSchema.nullish(),
  /** An existing person chosen from the picker. */
  personId: idSchema.nullish(),
  /** Required for kind `milestone`, from `POST /api/milestones`. */
  milestoneId: idSchema.nullish(),
  /**
   * The name as typed, for a tag or a person the archive has never heard
   * of. Carried until ingest; never accepted for a milestone.
   */
  labelSnapshot: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.freeTextMaxLength)
    .nullish(),
});

/** Whether an optional reference field was sent with a value. */
function _isPresent(value: string | null | undefined): boolean {
  return value !== undefined && value !== null;
}

/**
 * The per-kind rule: a tag names exactly one of `tagId` / `labelSnapshot`,
 * a person exactly one of `personId` / `labelSnapshot`, and a milestone a
 * `milestoneId` and nothing else. A reference to another kind is refused
 * too, so a stray `personId` on a tag edit cannot sit there unread.
 */
function _isCoherentUploadEdit(
  body: Readonly<z.infer<typeof createUploadEditBodySchema>>,
): boolean {
  const hasTag = _isPresent(body.tagId);
  const hasPerson = _isPresent(body.personId);
  const hasMilestone = _isPresent(body.milestoneId);
  const hasLabel = _isPresent(body.labelSnapshot);

  switch (body.kind) {
    case "tag":
      return hasTag !== hasLabel && !hasPerson && !hasMilestone;
    case "person":
      return hasPerson !== hasLabel && !hasTag && !hasMilestone;
    case "milestone":
      return hasMilestone && !hasLabel && !hasTag && !hasPerson;
  }
}

/**
 * `POST /api/upload-sessions/:sessionId/edits`: one bulk action.
 *
 * A new tag's `labelSnapshot` is capped as a tag name is everywhere else; a
 * new person's is not, because `people.display_name` is uncapped by design
 * (`conventions.md` § String lengths names the member column only).
 */
export const createUploadEditRequestSchema = createUploadEditBodySchema
  .refine(_isCoherentUploadEdit, {
    message:
      "A tag or a person names an id or a label, and a milestone names an id.",
    path: ["kind"],
  })
  .refine(
    (body) => {
      return (
        body.kind !== "tag" ||
        (body.labelSnapshot ?? "").length <= LIMITS.tagNameMaxLength
      );
    },
    { message: "A tag is a label, not a sentence.", path: ["labelSnapshot"] },
  );

/** `POST /api/upload-sessions/:sessionId/edits`. */
export type CreateUploadEditRequest = z.infer<
  typeof createUploadEditRequestSchema
>;
