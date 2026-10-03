import { describe, expect, it } from "vitest";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";

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
