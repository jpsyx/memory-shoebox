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
} from "../src/index.ts";
import { describe, expect, it } from "vitest";

const validCreate = {
  name: " Birthday ",
  startsOn: "2026-09-14",
  endsOn: "2026-09-15",
  blurb: " Cake ",
};
const itemId = "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678";
const itemIds = Array.from({ length: 501 }, (_, index) => {
  return `0199a1f0-2c3d-7e4a-8b5c-${String(index).padStart(12, "0")}`;
});

describe("milestone writes", () => {
  it("normalizes names and blurbs without applying caps to frozen references", () => {
    const schema = createMilestoneRequestSchema;
    expect(schema.parse(validCreate)).toMatchObject({
      name: "Birthday",
      blurb: "Cake",
    });
    expect(schema.parse({ ...validCreate, blurb: "  " })).toHaveProperty(
      "blurb",
      null,
    );
    expect(schema.safeParse({ ...validCreate, name: "  " }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ ...validCreate, name: "a".repeat(200) }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...validCreate, name: "a".repeat(201) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...validCreate, blurb: ` ${"a".repeat(280)} ` })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...validCreate, blurb: "a".repeat(281) }).success,
    ).toBe(false);
    expect(
      milestoneRefSchema.safeParse({
        milestoneId: itemId,
        ...validCreate,
        name: "a".repeat(201),
      }).success,
    ).toBe(true);
  });

  it("requires both real ends and reports an inverted create span on endsOn", () => {
    const schema = createMilestoneRequestSchema;
    const { endsOn: _endsOn, ...withoutEnd } = validCreate;
    expect(schema.safeParse(withoutEnd).success).toBe(false);
    expect(schema.safeParse({ ...validCreate, endsOn: null }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ ...validCreate, startsOn: "2026-02-30" }).success,
    ).toBe(false);
    const inverted = schema.safeParse({ ...validCreate, endsOn: "2026-09-13" });
    expect(inverted.success).toBe(false);
    if (!inverted.success) {
      expect(
        inverted.error.issues.map((issue) => {
          return issue.path.join(".");
        }),
      ).toContain("endsOn");
    }
  });

  it("accepts partial date patches for service merging and rejects empty patches", () => {
    const schema = updateMilestoneRequestSchema;
    expect(schema.safeParse({ startsOn: "2026-09-16" }).success).toBe(true);
    expect(schema.safeParse({ endsOn: "2026-09-10" }).success).toBe(true);
    expect(schema.parse({ name: " Birthday ", blurb: " " })).toMatchObject({
      name: "Birthday",
      blurb: null,
    });
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ unrelated: true }).success).toBe(false);
  });

  it("rejects duplicates and limits a create selection to 500 items", () => {
    const schema = createMilestoneRequestSchema;
    expect(
      schema.safeParse({ ...validCreate, itemIds: [itemId, itemId] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...validCreate, itemIds: itemIds.slice(0, 500) })
        .success,
    ).toBe(true);
    expect(schema.safeParse({ ...validCreate, itemIds }).success).toBe(false);
  });

  it("requires a nonempty delta with distinct IDs in disjoint directions", () => {
    const schema = setMilestoneItemsRequestSchema;
    [
      { attach: [], detach: [] },
      { attach: [itemId], detach: [itemId] },
      { attach: [itemId, itemId], detach: [] },
      { attach: [], detach: [itemId, itemId] },
    ].forEach((delta) => {
      expect(schema.safeParse(delta).success).toBe(false);
    });
    expect(schema.safeParse({ attach: [itemId] }).success).toBe(false);
    ["attach", "detach"].forEach((direction) => {
      const delta = {
        attach: [],
        detach: [],
        [direction]: itemIds.slice(0, 500),
      };
      expect(schema.safeParse(delta).success).toBe(true);
      expect(schema.safeParse({ ...delta, [direction]: itemIds }).success).toBe(
        false,
      );
    });
  });
});

describe("milestone pagination", () => {
  it.each([
    ["milestone list", listMilestonesRequestSchema, 50],
    ["mismatches", listMilestoneMismatchesRequestSchema, 50],
    ["candidates", listMilestoneCandidatesRequestSchema, 60],
  ])("defaults and bounds %s", (_label, schema, defaultLimit) => {
    expect(schema.parse({})).toHaveProperty("limit", defaultLimit);
    expect(schema.parse({ limit: "200" })).toHaveProperty("limit", 200);
    [0, -1, 201, 1.5].forEach((limit) => {
      expect(schema.safeParse({ limit }).success).toBe(false);
    });
    expect(schema.safeParse({ cursor: "" }).success).toBe(false);
  });

  it("validates query ranges and allows picker dates only in all scope", () => {
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
  });
});

describe("milestone reconciliation", () => {
  it("requires unique, nonempty lists capped at 500 for both modes", () => {
    const schema = reconcileMilestoneRequestSchema;
    [0, 500, 501].forEach((count) => {
      const ids = itemIds.slice(0, count);
      expect(
        schema.safeParse({ mode: "acknowledge", itemIds: ids }).success,
      ).toBe(count === 500);
      expect(
        schema.safeParse({
          mode: "move",
          moves: ids.map((id) => {
            return { itemId: id, targetOn: "2026-09-14" };
          }),
        }).success,
      ).toBe(count === 500);
    });
    expect(
      schema.safeParse({ mode: "acknowledge", itemIds: [itemId, itemId] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        mode: "move",
        moves: [
          { itemId, targetOn: "2026-09-14" },
          { itemId, targetOn: "2026-09-15" },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires per-item real target dates with addressable dotted errors", () => {
    const schema = reconcileMilestoneRequestSchema;
    const invalid = schema.safeParse({
      mode: "move",
      moves: [
        { itemId, targetOn: "2026-09-14" },
        { itemId: itemIds[1], targetOn: "2026-02-30" },
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
      schema.safeParse({ mode: "move", moves: [{ itemId }] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ mode: "unknown", itemIds: [itemId] }).success,
    ).toBe(false);
  });
});

describe("milestone response composition", () => {
  const milestone = {
    milestoneId: itemId,
    name: "Birthday",
    startsOn: "2026-09-14",
    endsOn: "2026-09-15",
    blurb: null,
  };
  const detail = {
    milestone,
    itemCount: 0,
    dayCount: 2,
    canEdit: true,
    canDelete: true,
    mismatchCount: 0,
    createdBy: null,
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-14T12:00:00.000Z",
  };

  it("requires detail metadata and per-viewer counts alongside the frozen reference", () => {
    const schema = milestoneDetailSchema;
    expect(schema.parse(detail)).toEqual(detail);
    expect(schema.safeParse({ ...detail, itemCount: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...detail, createdBy: undefined }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        ...detail,
        milestone: { ...milestone, endsOn: undefined },
      }).success,
    ).toBe(false);
  });

  it("requires envelopes, full mismatch context, and mutation result counts", () => {
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
        milestone,
      }).success,
    ).toBe(false);
    expect(setMilestoneItemsResponseSchema.safeParse(detail).success).toBe(
      false,
    );
    expect(
      reconcileMilestoneResponseSchema.safeParse({
        ...detail,
        movedCount: 0,
        acknowledgedCount: 0,
      }).success,
    ).toBe(false);
    expect(
      deleteMilestoneResponseSchema.safeParse({
        milestoneId: itemId,
        name: "Birthday",
        detachedItemCount: -1,
      }).success,
    ).toBe(false);
  });

  it("reuses the full band schema and validates continuation bands", () => {
    const schema = dayMilestonesDtoSchema;
    const band = { milestone, itemCount: 0, dayCount: 2, dayPosition: 1 };
    expect(schema.parse({ band, continues: [band] })).toEqual({
      band,
      continues: [band],
    });
    expect(
      schema.safeParse({ band: null, continues: [{ ...band, dayPosition: 0 }] })
        .success,
    ).toBe(false);
  });
});
