import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PeopleChips } from "./PeopleChips";

it("uses placeholder identity text rather than a raw person ID while facets load", () => {
  render(
    <PeopleChips
      selection={{
        tags: [],
        people: ["private-person-id"],
        from: undefined,
        until: undefined,
      }}
      facets={undefined}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("Loading person...")).toBeVisible();
  expect(screen.queryByText("private-person-id")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Stop filtering by Loading person..." }),
  ).toBeVisible();
});
