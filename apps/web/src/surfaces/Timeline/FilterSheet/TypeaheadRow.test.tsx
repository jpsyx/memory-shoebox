import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TypeaheadRow } from "./TypeaheadRow";
it("labels a matching ad-hoc identity in filter search", () => {
  render(
    <TypeaheadRow
      tags={[]}
      people={[
        {
          person: { personId: "person", displayName: "Jorge", isMember: false },
          itemCount: 2,
          face: null,
          firstCapturedOn: null,
          lastCapturedOn: null,
        },
      ]}
      selection={{ tags: [], people: [], from: undefined, until: undefined }}
      onToggle={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Jorge (not a member) 2" }),
  ).toBeVisible();
});
