import { describe, expect, it } from "vitest";
import {
  isSameNameList,
  makeNameKeyFromName,
} from "@/surfaces/Item/InThisOne/nameKeys/nameKeys";

describe("makeNameKeyFromName", () => {
  it("reads a name trimmed, composed and in any case as one key", () => {
    // The first spells the accent as two code points, the way some phones do.
    expect(makeNameKeyFromName("  Sofía ")).toBe(makeNameKeyFromName("SOFÍA"));
  });
});

describe("isSameNameList", () => {
  it("reads a repeat typed with a comma as no change", () => {
    expect(
      isSameNameList({
        names: ["hospital", "Mateo "],
        otherNames: ["Hospital", "mateo"],
      }),
    ).toBe(true);
  });

  it("ignores an empty name", () => {
    expect(
      isSameNameList({ names: ["Mateo", "  "], otherNames: ["Mateo"] }),
    ).toBe(true);
  });

  it("counts two people who share a name as two", () => {
    expect(
      isSameNameList({ names: ["Mateo"], otherNames: ["Mateo", "Mateo"] }),
    ).toBe(false);
  });

  it("sees a name added or taken away", () => {
    expect(
      isSameNameList({ names: ["Mateo", "Rosa"], otherNames: ["Mateo"] }),
    ).toBe(false);
  });
});
