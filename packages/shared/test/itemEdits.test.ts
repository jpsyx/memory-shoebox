import { describe, expect, it } from "vitest";
import {
  resolveVisibilityRuleRequestSchema,
  setCaptureDateRequestSchema,
  setItemPeopleRequestSchema,
  setItemTagsRequestSchema,
  setItemVisibilityRequestSchema,
  setItemsVisibilityRequestSchema,
  updateItemRequestSchema,
} from "../src/itemEdits.ts";

const ITEM_ID = "0199a0d4-0000-7000-8000-000000000001";

describe("updateItemRequestSchema", () => {
  it("takes one field and nothing else", () => {
    const parsed = updateItemRequestSchema.parse({
      altText: "Mateo blowing out the candle",
      capturedOn: "2026-09-14",
    });

    expect(parsed).toEqual({ altText: "Mateo blowing out the candle" });
  });

  it("accepts null, which clears the override", () => {
    expect(updateItemRequestSchema.parse({ altText: null }).altText).toBeNull();
  });

  it("rejects an override over 2000 characters", () => {
    expect(() => {
      return updateItemRequestSchema.parse({ altText: "x".repeat(2001) });
    }).toThrow();
  });
});

describe("setItemTagsRequestSchema", () => {
  it("rejects more than fifty tags", () => {
    expect(() => {
      return setItemTagsRequestSchema.parse({
        tags: Array.from({ length: 51 }, (_unused, index) => {
          return `tag-${index}`;
        }),
      });
    }).toThrow();
  });

  it("rejects a blank name", () => {
    expect(() => {
      return setItemTagsRequestSchema.parse({ tags: ["  "] });
    }).toThrow();
  });
});

describe("setItemPeopleRequestSchema", () => {
  it("takes an existing person by id or a new one by name", () => {
    const parsed = setItemPeopleRequestSchema.parse({
      people: [{ personId: ITEM_ID }, { displayName: "Mamá" }],
    });

    expect(parsed.people).toHaveLength(2);
  });

  it("rejects an entry that is neither", () => {
    expect(() => {
      return setItemPeopleRequestSchema.parse({ people: [{ name: "Mamá" }] });
    }).toThrow();
  });
});

describe("setItemVisibilityRequestSchema", () => {
  it("repoints one item at a rule", () => {
    const parsed = setItemVisibilityRequestSchema.parse({
      visibilityRuleId: "visibility-rule-everyone",
    });

    expect(parsed.visibilityRuleId).toBe("visibility-rule-everyone");
  });

  it("rejects an empty rule id", () => {
    expect(() => {
      return setItemVisibilityRequestSchema.parse({ visibilityRuleId: "" });
    }).toThrow();
  });
});

describe("setItemsVisibilityRequestSchema", () => {
  it("rejects an empty selection and a duplicate id", () => {
    expect(() => {
      return setItemsVisibilityRequestSchema.parse({
        itemIds: [],
        visibilityRuleId: "visibility-rule-everyone",
      });
    }).toThrow();

    expect(() => {
      return setItemsVisibilityRequestSchema.parse({
        itemIds: [ITEM_ID, ITEM_ID],
        visibilityRuleId: "visibility-rule-everyone",
      });
    }).toThrow();
  });
});

describe("resolveVisibilityRuleRequestSchema", () => {
  it("takes a mode and its subjects", () => {
    const parsed = resolveVisibilityRuleRequestSchema.parse({
      mode: "only",
      subjects: [{ kind: "group", id: ITEM_ID }],
    });

    expect(parsed.subjects[0]?.kind).toBe("group");
  });

  it("defaults the subjects to none, for everyone", () => {
    expect(
      resolveVisibilityRuleRequestSchema.parse({ mode: "everyone" }).subjects,
    ).toEqual([]);
  });
});

describe("setCaptureDateRequestSchema", () => {
  it("takes a day, and a clock time it may keep", () => {
    expect(
      setCaptureDateRequestSchema.parse({ capturedOn: "2026-09-14" })
        .capturedTime,
    ).toBeUndefined();

    expect(
      setCaptureDateRequestSchema.parse({
        capturedOn: "2026-09-14",
        capturedTime: "06:41:32",
      }).capturedTime,
    ).toBe("06:41:32");
  });

  it("rejects a day that is not YYYY-MM-DD and a time that is not HH:MM", () => {
    expect(() => {
      return setCaptureDateRequestSchema.parse({ capturedOn: "14/09/2026" });
    }).toThrow();

    expect(() => {
      return setCaptureDateRequestSchema.parse({
        capturedOn: "2026-09-14",
        capturedTime: "6.41am",
      });
    }).toThrow();
  });
});
