import type {
  MilestoneRef,
  MilestoneDetail,
  CreateMilestoneRequest,
} from "../index.ts";
import {
  createMilestoneRequestSchema,
  dayMilestonesDtoSchema,
  deleteMilestoneResponseSchema,
  listMilestoneCandidatesRequestSchema,
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesRequestSchema,
  listMilestoneMismatchesResponseSchema,
  listMilestonesRequestSchema,
  listMilestonesResponseSchema,
  milestoneDetailSchema,
  reconcileMilestoneRequestSchema,
  reconcileMilestoneResponseSchema,
  setMilestoneItemsRequestSchema,
  setMilestoneItemsResponseSchema,
  updateMilestoneRequestSchema,
  milestoneRefSchema,
} from "../index.ts";
import { describe, expect, it } from "vitest";

const VALID_CREATE = {
  name: " Birthday ",
  startsOn: "2026-09-14",
  endsOn: "2026-09-15",
  blurb: " Cake ",
} as const satisfies CreateMilestoneRequest;
const ITEM_ID = "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678";
const ITEM_IDS = Array.from({ length: 501 }, (_, index) => {
  return `0199a1f0-2c3d-7e4a-8b5c-${String(index).padStart(12, "0")}`;
});

const MILESTONE = {
  milestoneId: ITEM_ID,
  name: "Birthday",
  startsOn: "2026-09-14",
  endsOn: "2026-09-15",
  blurb: null,
} as const satisfies MilestoneRef;
const DETAIL = {
  milestone: MILESTONE,
  itemCount: 0,
  dayCount: 2,
  canEdit: true,
  canDelete: true,
  mismatchCount: 0,
  createdBy: null,
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
} as const satisfies MilestoneDetail;

function _assertNormalizesNamesAndBlurbsWithoutApplyingCapsTo1(): void {
  const schema = createMilestoneRequestSchema;
  expect(schema.parse(VALID_CREATE)).toMatchObject({
    name: "Birthday",
    blurb: "Cake",
  });
  expect(schema.parse({ ...VALID_CREATE, blurb: "  " })).toHaveProperty(
    "blurb",
    null,
  );
  expect(schema.safeParse({ ...VALID_CREATE, name: "  " }).success).toBe(false);
  expect(
    schema.safeParse({ ...VALID_CREATE, name: "a".repeat(200) }).success,
  ).toBe(true);
  expect(
    schema.safeParse({ ...VALID_CREATE, name: "a".repeat(201) }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ ...VALID_CREATE, blurb: ` ${"a".repeat(280)} ` })
      .success,
  ).toBe(true);
  expect(
    schema.safeParse({ ...VALID_CREATE, blurb: "a".repeat(281) }).success,
  ).toBe(false);
  expect(
    milestoneRefSchema.safeParse({
      milestoneId: ITEM_ID,
      ...VALID_CREATE,
      name: "a".repeat(201),
    }).success,
  ).toBe(true);
}

function _assertRequiresBothRealEndsAndReportsAnInverted2(): void {
  const schema = createMilestoneRequestSchema;
  const { endsOn: _endsOn, ...withoutEnd } = VALID_CREATE;
  expect(schema.safeParse(withoutEnd).success).toBe(false);
  expect(schema.safeParse({ ...VALID_CREATE, endsOn: null }).success).toBe(
    false,
  );
  expect(
    schema.safeParse({ ...VALID_CREATE, startsOn: "2026-02-30" }).success,
  ).toBe(false);
  const inverted = schema.safeParse({ ...VALID_CREATE, endsOn: "2026-09-13" });
  expect(inverted.success).toBe(false);
  if (!inverted.success) {
    expect(
      inverted.error.issues.map((issue) => {
        return issue.path.join(".");
      }),
    ).toContain("endsOn");
  }
}

function _assertAcceptsPartialDatePatchesForServiceMergingAnd3(): void {
  const schema = updateMilestoneRequestSchema;
  expect(schema.safeParse({ startsOn: "2026-09-16" }).success).toBe(true);
  expect(schema.safeParse({ endsOn: "2026-09-10" }).success).toBe(true);
  expect(schema.parse({ name: " Birthday ", blurb: " " })).toMatchObject({
    name: "Birthday",
    blurb: null,
  });
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ unrelated: true }).success).toBe(false);
}

function _assertRejectsDuplicatesAndLimitsACreateSelectionTo4(): void {
  const schema = createMilestoneRequestSchema;
  expect(
    schema.safeParse({ ...VALID_CREATE, itemIds: [ITEM_ID, ITEM_ID] }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ ...VALID_CREATE, itemIds: ITEM_IDS.slice(0, 500) })
      .success,
  ).toBe(true);
  expect(schema.safeParse({ ...VALID_CREATE, itemIds: ITEM_IDS }).success).toBe(
    false,
  );
}

function _assertRequiresANonemptyDeltaWithDistinctIDsIn5(): void {
  const schema = setMilestoneItemsRequestSchema;
  [
    { attach: [], detach: [] },
    { attach: [ITEM_ID], detach: [ITEM_ID] },
    { attach: [ITEM_ID, ITEM_ID], detach: [] },
    { attach: [], detach: [ITEM_ID, ITEM_ID] },
  ].forEach((delta) => {
    expect(schema.safeParse(delta).success).toBe(false);
  });
  expect(schema.safeParse({ attach: [ITEM_ID] }).success).toBe(false);
  ["attach", "detach"].forEach((direction) => {
    const delta = {
      attach: [],
      detach: [],
      [direction]: ITEM_IDS.slice(0, 500),
    };
    expect(schema.safeParse(delta).success).toBe(true);
    expect(schema.safeParse({ ...delta, [direction]: ITEM_IDS }).success).toBe(
      false,
    );
  });
}

function _assertDefaultsAndBoundsS6(
  _label: string,
  schema: import("zod").ZodObject<
    {
      limit: import("zod").ZodDefault<import("zod").ZodCoercedNumber<unknown>>;
      cursor: import("zod").ZodOptional<import("zod").ZodString>;
    },
    import("zod/v4/core").$strip
  >,
  defaultLimit: number,
): void {
  expect(schema.parse({})).toHaveProperty("limit", defaultLimit);
  expect(schema.parse({ limit: "200" })).toHaveProperty("limit", 200);
  [0, -1, 201, 1.5].forEach((limit) => {
    expect(schema.safeParse({ limit }).success).toBe(false);
  });
  expect(schema.safeParse({ cursor: "" }).success).toBe(false);
}

function _assertValidatesQueryRangesAndAllowsPickerDatesOnly7(): void {
  const schema = listMilestoneCandidatesRequestSchema;
  expect(schema.parse({})).toHaveProperty("scope", "span");
  expect(schema.safeParse({ from: "2026-09-14" }).success).toBe(false);
  expect(schema.safeParse({ scope: "span", to: "2026-09-14" }).success).toBe(
    false,
  );
  expect(schema.safeParse({ scope: "all", from: "2026-09-14" }).success).toBe(
    true,
  );
  [schema, listMilestonesRequestSchema].forEach((rangeSchema) => {
    expect(
      rangeSchema.safeParse({
        scope: "all",
        from: "2026-09-15",
        to: "2026-09-14",
      }).success,
    ).toBe(false);
    expect(
      rangeSchema.safeParse({ scope: "all", from: "2026-02-30" }).success,
    ).toBe(false);
  });
}

function _assertRequiresUniqueNonemptyListsCappedAt500For8(): void {
  const schema = reconcileMilestoneRequestSchema;
  [0, 500, 501].forEach((numItems) => {
    const itemIds = ITEM_IDS.slice(0, numItems);
    expect(
      schema.safeParse({ mode: "acknowledge", itemIds: itemIds }).success,
    ).toBe(numItems === 500);
    expect(
      schema.safeParse({
        mode: "move",
        moves: itemIds.map((id) => {
          return { itemId: id, targetOn: "2026-09-14" };
        }),
      }).success,
    ).toBe(numItems === 500);
  });
  expect(
    schema.safeParse({ mode: "acknowledge", itemIds: [ITEM_ID, ITEM_ID] })
      .success,
  ).toBe(false);
  expect(
    schema.safeParse({
      mode: "move",
      moves: [
        { itemId: ITEM_ID, targetOn: "2026-09-14" },
        { itemId: ITEM_ID, targetOn: "2026-09-15" },
      ],
    }).success,
  ).toBe(false);
}

function _assertRequiresPerItemRealTargetDatesWithAddressable9(): void {
  const schema = reconcileMilestoneRequestSchema;
  const invalid = schema.safeParse({
    mode: "move",
    moves: [
      { itemId: ITEM_ID, targetOn: "2026-09-14" },
      { itemId: ITEM_IDS[1], targetOn: "2026-02-30" },
    ],
  });
  expect(invalid.success).toBe(false);
  if (!invalid.success) {
    expect(
      invalid.error.issues.map((issue) => {
        return issue.path.join(".");
      }),
    ).toContain("moves.1.targetOn");
  }
  expect(
    schema.safeParse({ mode: "move", moves: [{ itemId: ITEM_ID }] }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ mode: "unknown", itemIds: [ITEM_ID] }).success,
  ).toBe(false);
}

function _assertRequiresDetailMetadataAndPerViewerCountsAlongside10(): void {
  const schema = milestoneDetailSchema;
  expect(schema.parse(DETAIL)).toEqual(DETAIL);
  expect(schema.safeParse({ ...DETAIL, itemCount: -1 }).success).toBe(false);
  expect(schema.safeParse({ ...DETAIL, createdBy: undefined }).success).toBe(
    false,
  );
  expect(
    schema.safeParse({
      ...DETAIL,
      milestone: { ...MILESTONE, endsOn: undefined },
    }).success,
  ).toBe(false);
}

function _assertRequiresEnvelopesFullMismatchContextAndMutationResult11(): void {
  expect(
    listMilestonesResponseSchema.safeParse({ milestones: [] }).success,
  ).toBe(false);
  expect(
    listMilestoneCandidatesResponseSchema.safeParse({
      candidates: [{}],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    listMilestoneMismatchesResponseSchema.safeParse({
      mismatches: [],
      nextCursor: null,
      milestone: MILESTONE,
    }).success,
  ).toBe(false);
  expect(setMilestoneItemsResponseSchema.safeParse(DETAIL).success).toBe(false);
  expect(
    reconcileMilestoneResponseSchema.safeParse({
      ...DETAIL,
      movedCount: 0,
      acknowledgedCount: 0,
    }).success,
  ).toBe(false);
  expect(
    deleteMilestoneResponseSchema.safeParse({
      milestoneId: ITEM_ID,
      name: "Birthday",
      detachedItemCount: -1,
    }).success,
  ).toBe(false);
}

function _assertReusesTheFullBandSchemaAndValidatesContinuation12(): void {
  const schema = dayMilestonesDtoSchema;
  const band = {
    milestone: MILESTONE,
    itemCount: 0,
    dayCount: 2,
    dayPosition: 1,
  };
  expect(schema.parse({ band, continues: [band] })).toEqual({
    band,
    continues: [band],
  });
  expect(
    schema.safeParse({ band: null, continues: [{ ...band, dayPosition: 0 }] })
      .success,
  ).toBe(false);
}
describe("milestone writes", () => {
  it(
    "normalizes names and blurbs without applying caps to frozen references",
    _assertNormalizesNamesAndBlurbsWithoutApplyingCapsTo1,
  );

  it(
    "requires both real ends and reports an inverted create span on endsOn",
    _assertRequiresBothRealEndsAndReportsAnInverted2,
  );

  it(
    "accepts partial date patches for service merging and rejects empty patches",
    _assertAcceptsPartialDatePatchesForServiceMergingAnd3,
  );

  it(
    "rejects duplicates and limits a create selection to 500 items",
    _assertRejectsDuplicatesAndLimitsACreateSelectionTo4,
  );

  it(
    "requires a nonempty delta with distinct IDs in disjoint directions",
    _assertRequiresANonemptyDeltaWithDistinctIDsIn5,
  );
});

describe("milestone pagination", () => {
  it.each([
    ["milestone list", listMilestonesRequestSchema, 50],
    ["mismatches", listMilestoneMismatchesRequestSchema, 50],
    ["candidates", listMilestoneCandidatesRequestSchema, 60],
  ])("defaults and bounds %s", _assertDefaultsAndBoundsS6);

  it(
    "validates query ranges and allows picker dates only in all scope",
    _assertValidatesQueryRangesAndAllowsPickerDatesOnly7,
  );
});

describe("milestone reconciliation", () => {
  it(
    "requires unique, nonempty lists capped at 500 for both modes",
    _assertRequiresUniqueNonemptyListsCappedAt500For8,
  );

  it(
    "requires per-item real target dates with addressable dotted errors",
    _assertRequiresPerItemRealTargetDatesWithAddressable9,
  );
});

describe("milestone response composition", () => {
  it(
    "requires detail metadata and per-viewer counts alongside the frozen reference",
    _assertRequiresDetailMetadataAndPerViewerCountsAlongside10,
  );

  it(
    "requires envelopes, full mismatch context, and mutation result counts",
    _assertRequiresEnvelopesFullMismatchContextAndMutationResult11,
  );

  it(
    "accepts full bands and rejects zero continuation day positions",
    _assertReusesTheFullBandSchemaAndValidatesContinuation12,
  );
});
