import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  PeopleField,
  type PeopleFieldGroup,
  type PeopleFieldMember,
  type PeopleFieldPerson,
} from "@/system/PeopleField/PeopleField";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

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

  it("reads none yet rather than 0", async () => {
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
  });

  it("reads new for a name it has not heard", async () => {
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

    await userEvent.type(screen.getByRole("combobox"), "Tío Andrés");
    expect(await screen.findByText("new")).toBeVisible();
  });

  it("prints nothing beside a member or a group it was told nothing about", async () => {
    _render(
      <PeopleField
        label="Who"
        mode="members-and-groups"
        value={[]}
        onChange={() => {}}
        members={[{ memberId: "m3", displayName: "Tía Marisol" }]}
        groups={[{ groupId: "g2", name: "Cousins" }]}
        defaultDropdownOpened
      />,
    );

    expect(
      await screen.findByRole("option", { name: "Tía Marisol" }),
    ).toBeVisible();
    expect(screen.getByRole("option", { name: "Cousins" })).toBeVisible();
  });

  it("offers a name two people share as one option", async () => {
    _render(
      <PeopleField
        label="Who"
        mode="anyone"
        value={[]}
        onChange={() => {}}
        members={[]}
        people={[
          ...PEOPLE,
          { personId: "p3", displayName: "Mateo", itemCount: 2 },
        ]}
        defaultDropdownOpened
      />,
    );

    expect(
      await screen.findAllByRole("option", { name: /Mateo/ }),
    ).toHaveLength(1);
  });

  it("takes a new name pressed in the list", async () => {
    const onChange = vi.fn();
    _render(
      <PeopleField
        label="Who"
        mode="anyone"
        value={[]}
        onChange={onChange}
        members={[]}
        people={PEOPLE}
      />,
    );

    await userEvent.type(screen.getByRole("combobox"), "Tío Andrés");
    await userEvent.click(
      await screen.findByRole("option", { name: /Tío Andrés/ }),
    );

    expect(onChange).toHaveBeenCalledWith(["Tío Andrés"]);
  });

  it("takes a new name chosen with the arrow keys", async () => {
    // jsdom has no scrollIntoView, and the list calls it on the option the
    // arrow lands on. Taken away again at the end of the case.
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const onChange = vi.fn();
    _render(
      <PeopleField
        label="Who"
        mode="anyone"
        value={[]}
        onChange={onChange}
        members={[]}
        people={PEOPLE}
      />,
    );

    const field = screen.getByRole("combobox");
    await userEvent.type(field, "Tío Andrés");
    await screen.findByRole("option", { name: /Tío Andrés/ });
    await userEvent.type(field, "{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(["Tío Andrés"]);
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("does not offer again, as new, a name the field already holds", async () => {
    // Held precomposed, searched with a combining accent: the same name to
    // the archive, but a different string to Mantine's own case-only check
    // for picked tags, so only AnyoneField can keep it off the list.
    const searched = "Sofi\u0301a";
    _render(
      <PeopleField
        label="Who"
        mode="anyone"
        value={["Sof\u00eda"]}
        onChange={() => {}}
        members={[]}
        people={[
          ...PEOPLE,
          { personId: "p3", displayName: `${searched} Ruiz`, itemCount: 3 },
        ]}
        defaultSearchValue={searched}
        defaultDropdownOpened
      />,
    );

    // The list is open and settled: a known name matching the search is in it.
    expect(await screen.findByRole("option", { name: /Ruiz/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /new/ })).toBeNull();
  });
});
