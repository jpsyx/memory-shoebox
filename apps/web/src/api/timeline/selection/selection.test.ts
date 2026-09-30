import { describe, expect, it } from "vitest";
import {
  getViewFromSearch,
  isSelectionActive,
  makeQueryFromSelection,
  makeQueryFromView,
  makeSearchFromSelection,
} from "@/api/timeline/selection/selection";

const EMPTY = { tags: [], people: [], from: undefined, until: undefined };

describe("getViewFromSearch", () => {
  it("reads one filter and many alike", () => {
    expect(getViewFromSearch({ tag: ["a"] }).selection.tags).toEqual(["a"]);
    expect(getViewFromSearch({ tag: ["a", "b"] }).selection.tags).toEqual([
      "a",
      "b",
    ]);
    expect(getViewFromSearch({}).selection.tags).toEqual([]);
  });

  it("keeps the jump apart from the selection", () => {
    const view = getViewFromSearch({ at: "2026-09-10" });
    expect(view.at).toBe("2026-09-10");
    expect(view.selection).toEqual(EMPTY);
  });
});

describe("isSelectionActive", () => {
  it("is false with nothing chosen, so the strip stays away", () => {
    expect(isSelectionActive(EMPTY)).toBe(false);
  });

  it("is true for any one of the four", () => {
    expect(isSelectionActive({ ...EMPTY, tags: ["a"] })).toBe(true);
    expect(isSelectionActive({ ...EMPTY, people: ["p"] })).toBe(true);
    expect(isSelectionActive({ ...EMPTY, from: "2026-01-01" })).toBe(true);
    expect(isSelectionActive({ ...EMPTY, until: "2026-01-01" })).toBe(true);
  });

  it("is false for a jump, which is a start position and not a filter", () => {
    expect(
      isSelectionActive(getViewFromSearch({ at: "2026-09-10" }).selection),
    ).toBe(false);
  });
});

describe("makeQueryFromView", () => {
  it("repeats a parameter rather than joining it with commas", () => {
    const query = makeQueryFromView({
      selection: { ...EMPTY, tags: ["a", "b"] },
      at: undefined,
    });
    expect(query.toString()).toBe("tags=a&tags=b");
  });

  it("sends the jump as `until`, because there is no other way in", () => {
    const query = makeQueryFromView({ selection: EMPTY, at: "2026-09-10" });
    expect(query.get("until")).toBe("2026-09-10");
  });

  it("takes the earlier of the jump and a real `until`", () => {
    const query = makeQueryFromView({
      selection: { ...EMPTY, until: "2026-09-30" },
      at: "2026-09-10",
    });
    expect(query.get("until")).toBe("2026-09-10");

    const other = makeQueryFromView({
      selection: { ...EMPTY, until: "2026-09-05" },
      at: "2026-09-10",
    });
    expect(other.get("until")).toBe("2026-09-05");
  });

  it("sends nothing at all when nothing is chosen", () => {
    expect(
      makeQueryFromView({ selection: EMPTY, at: undefined }).toString(),
    ).toBe("");
  });
});

describe("makeQueryFromSelection", () => {
  it("ignores the jump, because the rail's whole job is to be complete", () => {
    expect(
      makeQueryFromSelection({ ...EMPTY, from: "2026-01-01" }).toString(),
    ).toBe("from=2026-01-01");
  });
});

describe("makeSearchFromSelection", () => {
  it("round-trips through the router's own spelling", () => {
    const selection = {
      tags: ["a"],
      people: ["p"],
      from: "2026-01-01",
      until: undefined,
    };
    expect(
      getViewFromSearch(makeSearchFromSelection(selection)).selection,
    ).toEqual(selection);
  });

  it("leaves an empty dimension out rather than sending an empty array", () => {
    expect(makeSearchFromSelection(EMPTY)).toEqual({});
  });
});
