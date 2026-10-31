import { expect, it } from "vitest";
import { getPersonNamesFromFacets } from "./timelineDataHelpers";
it("carries membership labels into day-spine presentation copy", () => {
  expect(
    getPersonNamesFromFacets({
      tags: [],
      people: [
        {
          person: { personId: "person", displayName: "Jorge", isMember: false },
          isSelected: true,
          ownCount: 2,
          narrowedCount: null,
        },
      ],
      resultCount: 2,
    }).get("person"),
  ).toBe("Jorge (not a member)");
});
