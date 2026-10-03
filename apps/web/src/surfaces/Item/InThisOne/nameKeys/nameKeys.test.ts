import { describe, expect, it } from "vitest";
import { isSameNameList } from "@/surfaces/Item/InThisOne/nameKeys/nameKeys";

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
