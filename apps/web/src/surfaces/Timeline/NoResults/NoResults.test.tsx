import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NoResults } from "./NoResults";
it("retains membership labels in empty-result explanation and removal actions", () => {
  render(
    <MantineProvider>
      <NoResults
        selection={{
          tags: [],
          people: ["person"],
          from: undefined,
          until: undefined,
        }}
        facets={{
          tags: [],
          people: [
            {
              person: {
                personId: "person",
                displayName: "Jorge",
                isMember: false,
              },
              isSelected: true,
              ownCount: 2,
              narrowedCount: null,
            },
          ],
          resultCount: 0,
        }}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Drop Jorge (not a member)" }),
  ).toBeVisible();
  expect(screen.getByText(/is in 2 photographs/)).toHaveTextContent(
    "Jorge (not a member) is in 2 photographs",
  );
});
