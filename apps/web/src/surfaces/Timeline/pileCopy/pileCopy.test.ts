import { describe, expect, it } from "vitest";
import {
  nameList,
  spineCountLabel,
} from "@/surfaces/Timeline/pileCopy/pileCopy";

const EMPTY = { tags: [], people: [], from: undefined, until: undefined };
const NAMES = new Map([
  ["p1", "Elena"],
  ["p2", "Mateo"],
  ["p3", "Abuela Rosa"],
]);

describe("nameList", () => {
  it("joins nothing, one, two and three", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Elena"])).toBe("Elena");
    expect(nameList(["Elena", "Mateo"])).toBe("Elena and Mateo");
    expect(nameList(["Elena", "Mateo", "Rosa"])).toBe("Elena, Mateo and Rosa");
  });
});

describe("spineCountLabel", () => {
  it("leaves the spine alone when nothing is filtered", () => {
    expect(
      spineCountLabel({ selection: EMPTY, personNames: NAMES }),
    ).toBeUndefined();
  });

  it("uses the person's own name, never a pronoun", () => {
    expect(
      spineCountLabel({
        selection: { ...EMPTY, people: ["p1"] },
        personNames: NAMES,
      }),
    ).toBe("with Elena");
  });

  it("names every person chosen, in the order they were chosen", () => {
    expect(
      spineCountLabel({
        selection: { ...EMPTY, people: ["p2", "p3"] },
        personNames: NAMES,
      }),
    ).toBe("with Mateo and Abuela Rosa");
  });

  it("says `matching` for a filter that is not a person", () => {
    expect(
      spineCountLabel({
        selection: { ...EMPTY, tags: ["t"] },
        personNames: NAMES,
      }),
    ).toBe("matching");
    expect(
      spineCountLabel({
        selection: { ...EMPTY, from: "2026-01-01" },
        personNames: NAMES,
      }),
    ).toBe("matching");
  });

  it("falls back to `matching` rather than printing an id nobody knows", () => {
    expect(
      spineCountLabel({
        selection: { ...EMPTY, people: ["unknown"] },
        personNames: NAMES,
      }),
    ).toBe("matching");
  });
});
