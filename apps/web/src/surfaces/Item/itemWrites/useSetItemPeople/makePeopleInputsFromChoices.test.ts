import { expect, it } from "vitest";
import { makePeopleInputsFromChoices } from "./makePeopleInputsFromChoices";
it("never turns a new ad-hoc identity into a same-name member", () => {
  expect(
    makePeopleInputsFromChoices({
      choices: [{ displayName: "Jorge", isMember: false }],
      known: [{ personId: "member", displayName: "Jorge", isMember: true }],
    }),
  ).toEqual([{ displayName: "Jorge" }]);
});
