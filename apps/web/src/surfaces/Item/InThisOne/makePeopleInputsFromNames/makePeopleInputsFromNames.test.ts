import { describe, expect, it } from "vitest";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";

/** A combining acute accent: "í" written as "i" and this, in two parts. */
const COMBINING_ACUTE = String.fromCodePoint(0x0301);

const MATEO = {
  personId: "018f0000-0000-7000-8000-00000000e101",
  displayName: "Mateo",
};
const SOFIA = {
  personId: "018f0000-0000-7000-8000-00000000e102",
  displayName: "Sofía",
};

describe("makePeopleInputsFromNames", () => {
  it("sends a known person by id and a new one by name", () => {
    expect(
      makePeopleInputsFromNames({
        names: ["Mateo", "Bisabuela Elena"],
        known: [MATEO, SOFIA],
      }),
    ).toEqual([
      { personId: MATEO.personId },
      { displayName: "Bisabuela Elena" },
    ]);
  });

  it("keeps the person a name already had on the item", () => {
    const otherMateo = {
      ...MATEO,
      personId: "018f0000-0000-7000-8000-00000000e199",
    };
    expect(
      makePeopleInputsFromNames({
        names: ["Mateo"],
        known: [MATEO, otherMateo],
      }),
    ).toEqual([{ personId: MATEO.personId }]);
  });
});

describe("makePeopleInputsFromNames, read loosely", () => {
  it("matches a name trimmed, composed and in any case", () => {
    expect(
      makePeopleInputsFromNames({
        names: ["  mateo ", `Sofi${COMBINING_ACUTE}a`],
        known: [MATEO, SOFIA],
      }),
    ).toEqual([{ personId: MATEO.personId }, { personId: SOFIA.personId }]);
  });

  it("sends a new name trimmed and composed", () => {
    expect(
      makePeopleInputsFromNames({
        names: [`  Sofi${COMBINING_ACUTE}a Ruiz `],
        known: [],
      }),
    ).toEqual([{ displayName: "Sofía Ruiz" }]);
  });

  it("drops an empty name and a repeated one", () => {
    expect(
      makePeopleInputsFromNames({
        names: ["Bisabuela Elena", "  ", "bisabuela elena", "Mateo", "MATEO"],
        known: [MATEO, MATEO],
      }),
    ).toEqual([
      { displayName: "Bisabuela Elena" },
      { personId: MATEO.personId },
    ]);
  });

  it("keeps two people on one item who share a name, in order", () => {
    const otherMateo = {
      ...MATEO,
      personId: "018f0000-0000-7000-8000-00000000e199",
    };
    expect(
      makePeopleInputsFromNames({
        names: ["Mateo", "Mateo"],
        known: [MATEO, otherMateo],
      }),
    ).toEqual([
      { personId: MATEO.personId },
      { personId: otherMateo.personId },
    ]);
  });
});
