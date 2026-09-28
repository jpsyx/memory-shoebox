import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import {
  PeopleField,
  type PeopleFieldGroup,
  type PeopleFieldMember,
  type PeopleFieldPerson,
} from "@/system/PeopleField";
import { cssVariablesResolver, theme } from "@/theme/theme";

const MEMBERS: readonly PeopleFieldMember[] = [
  { memberId: "m1", displayName: "Papá", role: "admin" },
  { memberId: "m2", displayName: "Abuela Rosa", role: "viewer" },
];

const GROUPS: readonly PeopleFieldGroup[] = [
  { groupId: "g1", name: "The grandparents", memberCount: 4 },
];

const PEOPLE: readonly PeopleFieldPerson[] = [
  { personId: "p1", displayName: "Mateo", itemCount: 412 },
  { personId: "p2", displayName: "Bisabuela Elena", itemCount: 0 },
];

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("PeopleField", () => {
  it("shows a member's role beside their name", async () => {
    _render(
      <PeopleField
        label="Who"
        value={[]}
        onChange={() => {}}
        members={MEMBERS}
        defaultDropdownOpened
      />,
    );

    expect(await screen.findByText("Admin")).toBeVisible();
    expect(screen.getByText("Viewer")).toBeVisible();
  });

  it("puts groups first, because naming one is shorter than naming nine", async () => {
    _render(
      <PeopleField
        label="Who"
        mode="members-and-groups"
        value={[]}
        onChange={() => {}}
        members={MEMBERS}
        groups={GROUPS}
        defaultDropdownOpened
      />,
    );

    expect(await screen.findByText("4 people")).toBeVisible();
    const labels = screen.getAllByText(/Groups|People/);
    expect(labels[0]).toHaveTextContent("Groups");
  });

  it("reads none yet rather than 0, and new for a name it has not heard", async () => {
    _render(
      <PeopleField
        label="Who"
        mode="anyone"
        value={[]}
        onChange={() => {}}
        members={MEMBERS}
        people={PEOPLE}
        defaultDropdownOpened
      />,
    );

    expect(await screen.findByText("none yet")).toBeVisible();
    expect(screen.getByText("412")).toBeVisible();

    await userEvent.type(screen.getByRole("combobox"), "Tío Andrés");
    expect(await screen.findByText("new")).toBeVisible();
  });
});
