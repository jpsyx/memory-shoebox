import { expect, it } from "vitest";
import { personLabel } from "./personLabel";

it("distinguishes an ad-hoc or removed identity without changing raw names", () => {
  const person = { personId: "person", displayName: "Jorge", isMember: false };
  expect(personLabel(person)).toBe("Jorge (not a member)");
  expect(personLabel({ ...person, isMember: true })).toBe("Jorge");
  expect(person.displayName).toBe("Jorge");
});
